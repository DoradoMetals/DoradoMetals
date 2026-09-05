import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import { LOCKS } from "#shared/testing/locks.ts";
import { rollbackIn } from "#shared/testing/rollback.ts";
import { aUser, anOrder, aShipment } from "#shared/testing/builders/index.ts";
import { fulfillmentMethodId } from "#shared/testing/builders/reference.ts";
import * as fulfillments from "#db/fulfillments/repo.ts";
import * as pickups from "#db/fulfillments/pickups/repo.ts";
import { FulfillmentViewFacts } from "@dorado/contracts";
import { randomUUID } from "node:crypto";

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});
afterAll(async () => { await pool.end(); });

const inRollback = rollbackIn({ lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] });

test("the fulfillment view parses through FulfillmentViewFacts", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const order = await anOrder(c, user, { direction: "purchase" });
    const built = await aShipment(c, order);

    const [view] = await fulfillments.view(
      [built.fulfillment_id], null, false, null, null, null, c
    );
    assert.ok(view, "the view read nothing back");
    FulfillmentViewFacts.parse(view);

    assert.equal(view.fulfillment.id, built.fulfillment_id);
    assert.equal(view.method.category, "SHIPMENT");
    assert.equal(view.parcel?.id, built.id, "the parcel did not nest");
    assert.equal(view.parcel?.tracking_number, built.tracking_number);
    assert.equal(view.shipments.length, 1, "the link rows did not nest by table");
    assert.equal(view.pickup, null);
    assert.equal(view.direct, null);
    assert.equal(view.scheduled_at, null);
  });
});

test("the same read answers by order id and by fulfillment id", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const order = await anOrder(c, user, { direction: "purchase" });
    const built = await aShipment(c, order);

    const byOrder = await fulfillments.view(null, order.id, false, null, null, null, c);
    const byId = await fulfillments.view(
      [built.fulfillment_id], null, false, null, null, null, c
    );
    assert.deepEqual(byOrder, byId);
  });
});

test("the schedule filter answers only fulfillments with a booking in the window", async () => {
  await inRollback(async (c: PoolClient) => {
    const method_id = await fulfillmentMethodId(c, "PICKUP", "purchase");
    const draft = await fulfillments.createDraft(method_id, c);
    await pickups.create({ fulfillment_id: draft.id }, c);
    await pickups.update(draft.id, { start_time: "2026-09-04T15:00:00Z" }, c);

    const due = await fulfillments.view(
      null, null, true, "2026-09-04T00:00:00Z", "2026-09-05T00:00:00Z", null, c
    );
    assert.ok(due.some((f) => f.fulfillment.id === draft.id), "the booking is not on the schedule");
    assert.equal(
      due.find((f) => f.fulfillment.id === draft.id)?.scheduled_at,
      "2026-09-04T15:00:00.000Z",
      "scheduled_at is not the pickup's own start time in UTC"
    );

    const elsewhere = await fulfillments.view(
      null, null, true, "2026-08-01T00:00:00Z", "2026-08-31T00:00:00Z", null, c
    );
    assert.ok(!elsewhere.some((f) => f.fulfillment.id === draft.id), "the window is not applied");
  });
});
