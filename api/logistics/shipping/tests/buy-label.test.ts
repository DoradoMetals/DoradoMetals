import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import { mockSessions, restoreSessions } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { aUser, anAddress, anOrder, packageId, carrierServiceId } from "#shared/testing/builders/index.ts";
import * as shipmentService from "#logistics/shipping/shipments/service.ts";
import * as packagesRepo from "#db/shipping/packages/repo.ts";
import * as itemsRepo from "#db/orders/items/repo.ts";
import { parcelWeightLb } from "#logistics/shipping/rules.ts";

await mockSessions();
const labels = await import("#logistics/shipping/labels.ts");

afterAll(async () => {
  await restoreSessions();
  await pool.end();
});

async function anUnlabelledParcel(c: PoolClient) {
  const seller = await aUser(c, { name: "Buy Label Test Seller" });
  const address = await anAddress(c, seller);
  const order = await anOrder(c, seller, { direction: "purchase" })
    .withLots(1, { pre_melt: 20, unit: "g" })
    .withAddress(address);
  const carrier_service_id = await carrierServiceId(c);
  const package_id = await packageId(c);

  const shipment = await shipmentService.create(order.id, "Inbound", c);
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

test("the parcel's weight is computed from the order's own items and its box", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { expectedWeight } = await anUnlabelledParcel(c);
    assert.ok(expectedWeight > 0, "fixture: the computed weight is not positive");
    assert.ok(expectedWeight >= 1, "the box's own minimum did not govern");
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("a parcel that already has a label is refused before the carrier is asked", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { shipment_id } = await anUnlabelledParcel(c);
    await shipmentService.update(shipment_id, { tracking_number: "794000000010" }, c);

    await assert.rejects(() => labels.buyLabel(shipment_id), /already has a label/);
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("a parcel with no service or box chosen is refused", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { shipment_id } = await anUnlabelledParcel(c);
    await shipmentService.update(shipment_id, { carrier_service_id: null }, c);

    await assert.rejects(
      () => labels.buyLabel(shipment_id), /no service or package chosen/
    );
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("an unknown parcel is refused, not resolved off null", async () => {
  await inPinnedTransaction(async () => {
    await assert.rejects(
      () => labels.buyLabel("00000000-0000-0000-0000-000000000000"), /no shipment/
    );
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});
