// LABEL-AFTER-COMMIT (2026-09-03), orders.cancel's own oracle. The finding:
// a return label was bought BEFORE the transaction that recorded it, and a
// try/catch voided it if that transaction failed - a voided label is still a
// billed one. Now the return shipment commits as a SHELL first, and the label
// is bought only after - so a carrier failure must leave that shell standing,
// and calling cancel again must find it rather than minting a second one.
//
// buyReturnLabel is stubbed via cancel's own injection seam (BuyReturnLabel) -
// the same shape sendToRefiner already has for email and place.ts has for
// postage - so no cassette or network guard is needed to prove either claim.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import { mockSessions, restoreSessions } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { aUser, anAddress, anOrder, packageId, carrierServiceId } from "#shared/testing/builders/index.ts";
import type { BuyReturnLabel } from "#domain/orders/service.ts";

await mockSessions();
const orders = await import("#domain/orders/service.ts");

afterAll(async () => {
  await restoreSessions();
  await pool.end();
});

// declared_value and weight are COMPUTED now (ruling 58) - order.totals.total
// and order.items/package - so the input carries only the two ids OrderCancel
// still takes.
async function aCancellableOrder(c: PoolClient) {
  const seller = await aUser(c, { name: "Cancel Test Seller" });
  const address = await anAddress(c, seller);
  const order = await anOrder(c, seller, { direction: "purchase" })
    .withLots(1)
    .withAddress(address)
    .withTotals({ total: 500 });
  return {
    order_id: order.id,
    input: {
      carrier_service_id: await carrierServiceId(c),
      package_id: await packageId(c),
    },
  };
}

const returnShipmentsFor = async (c: PoolClient, order_id: string) => {
  const { rows } = await c.query(
    `SELECT s.id, s.tracking_number, s.label FROM shipping.shipments s
      JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
      JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
     WHERE f.order_id = $1 AND s.direction = 'Return'`,
    [order_id]
  );
  return rows;
};

test("the return shipment commits before the carrier is asked, and a failure leaves it standing", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { order_id, input } = await aCancellableOrder(c);

    const failing: BuyReturnLabel = async () => {
      throw new Error("FEDEX IS DOWN");
    };

    await assert.rejects(() => orders.cancel(order_id, input, failing), /FEDEX IS DOWN/);

    const shipments = await returnShipmentsFor(c, order_id);
    assert.equal(shipments.length, 1, "the failed call did not leave exactly one return shell");
    assert.equal(shipments[0].tracking_number, null, "a failed carrier call still recorded a tracking number");
    assert.equal(shipments[0].label, null, "a failed carrier call still recorded a label");

    const { rows: [orderRow] } = await c.query(
      `SELECT spots_locked FROM orders.orders WHERE id = $1`, [order_id]
    );
    assert.equal(orderRow.spots_locked, false, "the WRITE step's own unpin did not commit");
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("calling cancel again reuses the same shell instead of minting a second return shipment", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { order_id, input } = await aCancellableOrder(c);

    const failing: BuyReturnLabel = async () => {
      throw new Error("FEDEX IS DOWN");
    };
    await assert.rejects(() => orders.cancel(order_id, input, failing), /FEDEX IS DOWN/);

    const succeeding: BuyReturnLabel = async () => ({
      tracking_number: "794000000001", label: Buffer.from("a label"),
    });
    const view = await orders.cancel(order_id, input, succeeding);

    const returns = view.shipments.filter((s) => s.direction === "Return");
    assert.equal(returns.length, 1, "a retry minted a second return shipment");
    assert.equal(returns[0].tracking_number, "794000000001");

    const shipments = await returnShipmentsFor(c, order_id);
    assert.equal(shipments.length, 1, "a second return shipment row exists in the database");
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("a clean cancel buys the label against the row it already committed", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { order_id, input } = await aCancellableOrder(c);

    const succeeding: BuyReturnLabel = async () => ({
      tracking_number: "794000000002", label: Buffer.from("a label"),
    });
    const view = await orders.cancel(order_id, input, succeeding);

    assert.equal(view.order.spots_locked, false);
    const returns = view.shipments.filter((s) => s.direction === "Return");
    assert.equal(returns.length, 1);
    assert.equal(returns[0].tracking_number, "794000000002");
    assert.equal(returns[0].carrier_service_id, input.carrier_service_id);
    assert.equal(returns[0].package_id, input.package_id);
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});
