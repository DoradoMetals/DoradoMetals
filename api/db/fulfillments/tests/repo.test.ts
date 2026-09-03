// The writes on fulfillments.fulfillments, against real Postgres.
//
// Most of this file is self-contained via createDraft: a draft fulfillment
// has no order, so those tests never touch a shared row. The attachToOrder
// test DOES borrow a real order, the same hazard
// domain/fulfillments/tests/service.test.ts documents (two files racing the
// same "free" order deadlock rather than fail), so this file takes the same
// lock.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";
import * as fulfillments from "#db/fulfillments/repo.ts";

let client: PoolClient;

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});

after(async () => {
  client.release();
  await pool.end();
});

async function inRollback(fn: (c: PoolClient) => Promise<void>) {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

async function aMethodId(c: PoolClient): Promise<string> {
  const { rows: [m] } = await c.query(`SELECT id FROM fulfillments.methods LIMIT 1`);
  assert.ok(m, "dev has no fulfillments.methods row - seeded reference data is missing");
  return m.id;
}

test("update writes status and method_id, leaving a column the patch never named alone", async () => {
  await inRollback(async (c: PoolClient) => {
    const method_id = await aMethodId(c);
    const draft = await fulfillments.createDraft(
      { id: randomUUID(), method_id }, c
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

test("attachToOrder is one-way: a second attach changes nothing", async () => {
  await inRollback(async (c: PoolClient) => {
    await takeLocks(c, LOCKS.FULFILLMENTS);
    const method_id = await aMethodId(c);
    const draft = await fulfillments.createDraft(
      { id: randomUUID(), method_id }, c
    );
    const { rows: [order] } = await c.query(
      `SELECT id FROM orders.orders WHERE NOT EXISTS (
         SELECT 1 FROM fulfillments.fulfillments f WHERE f.order_id = orders.orders.id
       ) LIMIT 1`
    );
    assert.ok(order, "dev has no order free of a fulfillment to attach a draft to");

    const attached = await fulfillments.attachToOrder(
      draft.id, { order_id: order.id }, c
    );
    assert.ok(attached, "the first attach wrote no row");
    assert.equal(attached.order_id, order.id);

    const second = await fulfillments.attachToOrder(
      draft.id, { order_id: order.id }, c
    );
    assert.equal(second, undefined, "a second attach on an already-attached draft wrote a row");
  });
});
