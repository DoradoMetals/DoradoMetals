// POST /api/shipments/:id/label - `shipping.buyLabel`'s own oracle.
//
// IT MOVED HERE WITH ITS SUBJECT (rulings 31 and 67, Jacob: "I don't
// understand why any carrier or shipping stuff is living in orders"). The
// route was POST /api/orders/:id/label and the use case was
// `orders.buyLabel`; a label belongs to the PARCEL, and the order it is for is
// resolved from the shipment rather than the other way round.
//
// RULING 58 (2026-09-03): the body carries no weight at all - it is computed
// from the ORDER's own items and the shipment's own package, the same rule
// cancel's return label uses (domain/shipping/rules.ts parcelWeightLb).
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import { mockSessions, restoreSessions } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { aUser, anAddress, anOrder, packageId, carrierServiceId } from "#shared/testing/builders/index.ts";
import * as shipmentService from "#domain/shipping/shipments/service.ts";
import * as packagesRepo from "#db/shipping/packages/repo.ts";
import * as itemsRepo from "#db/orders/items/repo.ts";
import { parcelWeightLb } from "#domain/shipping/rules.ts";

await mockSessions();
const labels = await import("#domain/shipping/labels.ts");

afterAll(async () => {
  await restoreSessions();
  await pool.end();
});

// A "Store Dropoff" shipment shell - no schedule needed, so no slot has to be
// handed in. The shell already carries package_id/carrier_service_id, exactly
// what placePurchase's own WRITE step leaves behind.
async function anUnlabelledParcel(c: PoolClient) {
  const seller = await aUser(c, { name: "Buy Label Test Seller" });
  const address = await anAddress(c, seller);
  const order = await anOrder(c, seller, { direction: "purchase" })
    .withLots(1, { pre_melt: 20, unit: "g" })
    .withAddress(address);
  const carrier_service_id = await carrierServiceId(c);
  const package_id = await packageId(c);

  const shipment = await shipmentService.create({ order_id: order.id, direction: "Inbound" }, c);
  if (!shipment) throw new Error("fixture: the shipment shell was not created");
  await shipmentService.update(
    shipment.id,
    { package_id, carrier_service_id, pickup_type: "Store Dropoff" },
    c
  );

  const box = await packagesRepo.getOne(package_id, c);
  const items = await itemsRepo.getFor(order.id, c);
  return {
    order_id: order.id,
    shipment_id: shipment.id,
    expectedWeight: parcelWeightLb(items, box),
  };
}

// THE WEIGHT IS THE ORDER'S, and no column stores it - which is why this
// asserts it through the rule rather than through a row. `buyLabel` reads
// exactly these two things to compute it.
test("the parcel's weight is computed from the order's own items and its box", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { expectedWeight } = await anUnlabelledParcel(c);
    assert.ok(expectedWeight > 0, "fixture: the computed weight is not positive");
    // Twenty grams of metal is far under a pound, so the BOX's own minimum is
    // what governs - which is the whole reason the weight is the server's.
    assert.ok(expectedWeight >= 1, "the box's own minimum did not govern");
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

// THE RETRY SURFACE IS FOR A LABEL THAT WAS NEVER BOUGHT. One that exists is
// billed, and buying a second is a second charge - so the refusal comes BEFORE
// the carrier is reached, which is what lets this assert it with no network.
test("a parcel that already has a label is refused before the carrier is asked", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { shipment_id } = await anUnlabelledParcel(c);
    await shipmentService.update(shipment_id, { tracking_number: "794000000010" }, c);

    await assert.rejects(() => labels.buyLabel(shipment_id), /already has a label/);
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

// A carrier cannot be asked for a label until somebody has chosen the service
// and the box - the shell exists from the moment the order does.
test("a parcel with no service or box chosen is refused", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { shipment_id } = await anUnlabelledParcel(c);
    await shipmentService.update(shipment_id, { carrier_service_id: null }, c);

    await assert.rejects(
      () => labels.buyLabel(shipment_id), /no service or package chosen/
    );
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

// The id is the whole message (ruling 43), so an unknown one is a NotFound
// rather than a TypeError after the decision to call FedEx has been taken.
test("an unknown parcel is refused, not resolved off null", async () => {
  await inPinnedTransaction(async () => {
    await assert.rejects(
      () => labels.buyLabel("00000000-0000-0000-0000-000000000000"), /no shipment/
    );
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});
