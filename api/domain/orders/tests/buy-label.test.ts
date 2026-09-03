// POST /api/orders/:id/label - orders.buyLabel's own oracle.
//
// RULING 58 (2026-09-03): the body carries no weight at all any more - it is
// computed from the order's own items and its shipment's own package, the
// same rule cancel's return label uses (domain/shipping/rules.ts
// parcelWeightLb). This proves the PARCEL the carrier is asked about carries
// that computed weight, never one the caller could have supplied.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import { mockSessions, restoreSessions } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { aUser, anAddress, anOrder, packageId, carrierServiceId } from "#shared/testing/builders/index.ts";
import * as shipmentService from "#domain/shipping/shipments/service.ts";
import * as packagesRepo from "#db/shipping/packages/repo.ts";
import * as itemsRepo from "#db/orders/items/repo.ts";
import { parcelWeightLb } from "#domain/shipping/rules.ts";
import type { Postage } from "#domain/orders/postage.ts";
import type * as rules from "#domain/orders/rules.ts";

await mockSessions();
const orders = await import("#domain/orders/service.ts");

afterAll(async () => {
  await restoreSessions();
  await pool.end();
});

// A "Store Dropoff" shipment shell - no schedule needed, so an empty body is
// enough. The shell already carries package_id/carrier_service_id, exactly
// what placePurchase's own WRITE step leaves behind.
async function anUnlabelledOrder(c: PoolClient) {
  const seller = await aUser(c, { name: "Buy Label Test Seller" });
  const address = await anAddress(c, seller);
  const order = await anOrder(c, seller, { direction: "purchase" })
    .withLots(1, { pre_melt: 20, unit: "g" })
    .withAddress(address);
  const carrier_service_id = await carrierServiceId(c);
  const package_id = await packageId(c);

  const shipment = await shipmentService.create({ order_id: order.id, type: "Inbound" }, c);
  if (!shipment) throw new Error("fixture: the shipment shell was not created");
  await shipmentService.patch(
    shipment.id,
    { package_id, carrier_service_id, pickup_type: "Store Dropoff" },
    c
  );

  const box = await packagesRepo.getOne(package_id, c);
  const items = await itemsRepo.getFor(order.id, c);
  const expectedWeight = parcelWeightLb(items, box);
  return { order_id: order.id, expectedWeight };
}

test("buyLabel computes the parcel's weight from the order's own items, never the body", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { order_id, expectedWeight } = await anUnlabelledOrder(c);
    assert.ok(expectedWeight > 0, "fixture: the computed weight is not positive");

    let askedWeight: number | undefined;
    const buy = async (
      _shipper: unknown, _personName: string, parcel: rules.Parcel
    ): Promise<Postage> => {
      askedWeight = parcel.weight.value;
      return { netCharge: 12, tracking_number: "794000000010", label: null, pickup: null };
    };

    const view = await orders.buyLabel(order_id, {}, buy as Parameters<typeof orders.buyLabel>[2]);

    assert.equal(askedWeight, expectedWeight, "the carrier was not asked about the order's own weight");
    const inbound = view.shipments.find((s) => s.direction === "Inbound");
    assert.equal(inbound?.tracking_number, "794000000010");
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("buyLabel refuses a shipment that already has a label", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { order_id } = await anUnlabelledOrder(c);
    const buy = async (): Promise<Postage> => ({
      netCharge: 12, tracking_number: "794000000011", label: null, pickup: null,
    });
    await orders.buyLabel(order_id, {}, buy as Parameters<typeof orders.buyLabel>[2]);

    await assert.rejects(
      () => orders.buyLabel(order_id, {}, buy as Parameters<typeof orders.buyLabel>[2]),
      /already has a label/
    );
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});
