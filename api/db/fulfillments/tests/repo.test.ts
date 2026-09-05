import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#pool";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";
import { inRollback } from "#shared/testing/rollback.ts";
import { aUser, anOrder, fulfillmentMethodId } from "#shared/testing/builders/index.ts";
import * as fulfillments from "#db/fulfillments/repo.ts";

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

const aMethodId = (c: PoolClient) => fulfillmentMethodId(c, "CARRIER DROPOFF", "purchase");

test("update writes status and method_id, leaving a column the patch never named alone", async () => {
  await inRollback(async (c: PoolClient) => {
    const method_id = await aMethodId(c);
    const draft = await fulfillments.createDraft(
      { method_id }, c
    );

    const changed = await fulfillments.update(draft.id, { status: "COMPLETED" }, c);
    assert.equal(changed, true, "update reported no row changed");

    const after = await fulfillments.getOne(draft.id, c);
    assert.equal(after?.status, "COMPLETED");
    assert.equal(after?.method_id, method_id, "method_id changed though the patch never named it");
  });
});

test("update answers false for an id with no fulfillment row", async () => {
  await inRollback(async (c: PoolClient) => {
    const changed = await fulfillments.update(randomUUID(), { status: "COMPLETED" }, c);
    assert.equal(changed, false, "update reported a change for a fulfillment that does not exist");
  });
});

test("update(order_id) is one-way: a second attach changes nothing", async () => {
  await inRollback(async (c: PoolClient) => {
    await takeLocks(c, LOCKS.FULFILLMENTS);
    const method_id = await aMethodId(c);
    const draft = await fulfillments.createDraft(
      { method_id }, c
    );
    const order = await anOrder(c, await aUser(c), { direction: "purchase" });

    const attached = await fulfillments.update(draft.id, { order_id: order.id }, c);
    assert.equal(attached, true, "the first attach wrote no row");
    const after = await fulfillments.getOne(draft.id, c);
    assert.equal(after?.order_id, order.id);

    const second = await fulfillments.update(draft.id, { order_id: order.id }, c);
    assert.equal(second, false, "a second attach on an already-attached draft wrote a row");
  });
});
