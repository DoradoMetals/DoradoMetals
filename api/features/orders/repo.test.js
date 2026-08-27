// The writes on orders.orders, against real Postgres.
//
// One table for both directions, where exchange had two - so these replace a
// statement that existed twice, once in purchase_orders and once in
// sales_orders. sales-orders still carries its own identical copies (D42);
// these are the canonical ones and the convergence point.
//
// Each test runs inside a transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as orders from "#features/orders/repo.ts";

let client;

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

async function inRollback(fn) {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

const anOrder = async (c) =>
  (await c.query("SELECT id FROM orders.orders ORDER BY id LIMIT 1")).rows[0]?.id ?? null;

const orderRow = async (c, id) =>
  (await c.query(
    `SELECT status, updated_by, order_sent, tracking_updated, review_created
       FROM orders.orders WHERE id = $1`, [id]
  )).rows[0];

test("a status change records the status and its author", async () => {
  await inRollback(async (c) => {
    const id = await anOrder(c);
    assert.ok(id, "orders.orders is empty - this test proves nothing");
    // A sentinel, so a pass cannot come from the value already being there.
    const status = `probe-${randomUUID().slice(0, 8)}`;

    const returned = await orders.setStatus(id, status, "alice", c);
    assert.equal(returned, id, "the write did not report the row it changed");

    const row = await orderRow(c, id);
    assert.equal(row.status, status);
    assert.equal(row.updated_by, "alice");
  });
});

// updated_by is ASSIGNED here, not coalesced - both exchange statements
// overwrote it unconditionally. This pins that, so a later "improvement" to
// coalesce it has to be a deliberate decision rather than a silent one.
test("a status change with no author clears the author", async () => {
  await inRollback(async (c) => {
    const id = await anOrder(c);
    assert.ok(id, "orders.orders is empty");
    await c.query("UPDATE orders.orders SET updated_by = 'alice' WHERE id = $1", [id]);

    await orders.setStatus(id, "Pending", null, c);

    assert.equal(
      (await orderRow(c, id)).updated_by, null,
      "updated_by is assigned, not coalesced - exchange overwrote it unconditionally"
    );
  });
});

test("each of the three flags sets its own column and no other", async () => {
  await inRollback(async (c) => {
    const id = await anOrder(c);
    assert.ok(id, "orders.orders is empty");

    for (const flag of ["order_sent", "tracking_updated", "review_created"]) {
      // Start from all-false, so each assertion is about this call alone.
      await c.query(
        `UPDATE orders.orders
            SET order_sent = false, tracking_updated = false, review_created = false
          WHERE id = $1`, [id]
      );

      const returned = await orders.setFlag(id, flag, c);
      assert.equal(returned, id, `${flag} did not report the row it changed`);

      const row = await orderRow(c, id);
      assert.equal(row[flag], true, `${flag} was not set`);
      for (const other of ["order_sent", "tracking_updated", "review_created"]) {
        if (other === flag) continue;
        assert.equal(row[other], false, `setting ${flag} also set ${other}`);
      }
    }
  });
});

// The column name is interpolated into the statement. Nothing derived from a
// request can reach it, but that is a property of the closed set - so the set
// is asserted rather than assumed.
test("the flag set is closed to exactly three names", async () => {
  assert.deepEqual(Object.keys(orders.FLAGS).sort(), [
    "order_sent", "review_created", "tracking_updated",
  ]);
  for (const [key, column] of Object.entries(orders.FLAGS)) {
    assert.equal(key, column, "a flag key and its column name must match");
    assert.match(column, /^[a-z_]+$/, "a flag column must be a bare identifier");
  }
});
