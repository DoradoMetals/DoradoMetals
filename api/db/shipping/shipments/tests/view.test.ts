import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import { LOCKS } from "#shared/testing/locks.ts";
import { rollbackIn } from "#shared/testing/rollback.ts";
import { aUser, anOrder, aShipment } from "#shared/testing/builders/index.ts";
import * as shipments from "#db/shipping/shipments/repo.ts";
import * as trackingRepo from "#db/shipping/tracking/repo.ts";
import { ShipmentViewFacts } from "@dorado/contracts";

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});
afterAll(async () => { await pool.end(); });

const inRollback = rollbackIn({ lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] });

test("the shipment view parses through ShipmentViewFacts", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const order = await anOrder(c, user, { direction: "purchase" });
    const built = await aShipment(c, order);

    const [view] = await shipments.view(built.id, null, c);
    assert.ok(view, "the view read nothing back");
    ShipmentViewFacts.parse(view);

    assert.equal(view.shipment.id, built.id);
    assert.equal(view.service?.id, built.carrier_service_id, "the service did not nest");
    assert.equal(view.package?.id, built.package_id, "the package did not nest");
    assert.equal(view.carrier_id, view.service?.carrier_id, "carrier_id is not the service's");
    assert.equal(view.carrier_pickup, null);
    assert.equal(view.handoff_at, null);
    assert.deepEqual(view.tracking, []);
    assert.ok(!("label" in view.shipment), "the label bytes reached a read shape");
  });
});

test("the scans nest by table, in scan order, as UTC strings", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const order = await anOrder(c, user, { direction: "purchase" });
    const built = await aShipment(c, order);

    await trackingRepo.insert(
      [
        { status: "In Transit", location: "Dallas TX", date: "2026-09-02T10:00:00Z" },
        { status: "Picked Up", location: "Austin TX", date: "2026-09-01T09:00:00Z" },
      ],
      built.id,
      c
    );

    const [view] = await shipments.view(built.id, null, c);
    assert.ok(view);
    assert.deepEqual(
      view.tracking.map((t) => t.status),
      ["Picked Up", "In Transit"],
      "the scans are not in scan order"
    );
    assert.equal(view.tracking[0]!.scan_time, "2026-09-01T09:00:00.000Z");
  });
});

test("reading by order answers every parcel the order's fulfillment links", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const order = await anOrder(c, user, { direction: "purchase" });
    const built = await aShipment(c, order);

    const forOrder = await shipments.view(null, order.id, c);
    assert.deepEqual(forOrder.map((v) => v.shipment.id), [built.id]);
  });
});
