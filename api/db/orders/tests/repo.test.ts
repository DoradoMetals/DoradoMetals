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
import * as orders from "#db/orders/repo.ts";
import type { PoolClient } from "pg";
import type { Flag } from "#db/orders/repo.ts";

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

const anOrder = async (c: PoolClient): Promise<string | null> =>
  (await c.query("SELECT id FROM orders.orders ORDER BY id LIMIT 1")).rows[0]?.id ?? null;

const orderRow = async (c: PoolClient, id: string) =>
  (await c.query(
    `SELECT status, updated_by, updated_by_id, updated_at, created_at,
            order_sent, tracking_updated, review_created
       FROM orders.orders WHERE id = $1`, [id]
  )).rows[0] as Record<string, unknown>;

// The signed-in person, as the database sees one. Read from auth.users because
// updated_by_id is a foreign key to it, and the trigger resolves the setting
// against that table before stamping - an invented uuid would be discarded.
const anAdmin = async (c: PoolClient): Promise<{ id: string; name: string }> =>
  (await c.query(`SELECT id, name FROM auth.users WHERE role = 'admin' LIMIT 1`)).rows[0];

// What shared/db/withTransaction.ts does for a real request, done by hand: a
// repo test holds the transaction itself and never opens one.
const actingAs = async (c: PoolClient, id: string | null) => {
  await c.query("SELECT set_config('app.actor_id', $1, true)", [id ?? ""]);
};

// THE AUTHOR IS NOT AN ARGUMENT ANY MORE. `update` used to take
// `{ status, updated_by }` and this test passed "alice"; migration 116 moved
// the write to the public.audit_stamp trigger, which reads app.actor_id off
// the connection. The claim is the same one - a status change records WHO -
// asked of the mechanism that now answers it.
test("a status change records the status and its author", async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await anOrder(c);
    assert.ok(id, "orders.orders is empty - this test proves nothing");
    const admin = await anAdmin(c);
    assert.ok(admin, "auth.users has no admin - this test proves nothing");
    // A sentinel, so a pass cannot come from the value already being there.
    const status = `probe-${randomUUID().slice(0, 8)}`;

    await actingAs(c, admin.id);
    const returned = await orders.update(id, { status }, {}, c);
    assert.equal(returned?.id, id, "the write did not report the row it changed");

    const row = await orderRow(c, id);
    assert.equal(row.status, status);
    assert.equal(row.updated_by_id, admin.id, "the trigger did not stamp the actor");
    assert.equal(row.updated_by, admin.name, "the legacy name column went unfilled");
  });
});

// The replacement for "a status change with no author clears the author",
// which pinned exchange's unconditional overwrite. The answer is deliberately
// the other one now: with nobody signed in - a cron sweep, a Stripe webhook -
// the trigger COALESCEs and the previous author STAYS, because "the reconciler
// touched this" is not a reason to forget who last edited it. updated_at still
// moves, so the row records that something happened.
test("a status change with no actor keeps the previous author and still moves updated_at", async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await anOrder(c);
    assert.ok(id, "orders.orders is empty");
    const admin = await anAdmin(c);
    assert.ok(admin, "auth.users has no admin");

    await actingAs(c, admin.id);
    await orders.update(id, { status: "Pending" }, {}, c);
    const before = await orderRow(c, id);

    await actingAs(c, null);
    await orders.update(id, { status: "Preparing" }, {}, c);
    const after = await orderRow(c, id);

    assert.equal(after.status, "Preparing");
    assert.equal(after.updated_by_id, admin.id, "an unattributed write erased the author");
    assert.equal(after.updated_by, admin.name);
    assert.ok(
      (after.updated_at as Date) > (before.updated_at as Date),
      "updated_at did not move on the second write"
    );
  });
});

test("each of the three flags sets its own column and no other", async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await anOrder(c);
    assert.ok(id, "orders.orders is empty");

    // THE CLOSED SET, TYPED AS ITSELF. setFlag takes a `Flag`, and a bare
    // string array would not satisfy it - which is the conversion doing its
    // job: the whole reason the column name can be interpolated safely is
    // that this set is closed.
    const FLAGS: Flag[] = ["order_sent", "tracking_updated", "review_created"];
    for (const flag of FLAGS) {
      // Start from all-false, so each assertion is about this call alone.
      await c.query(
        `UPDATE orders.orders
            SET order_sent = false, tracking_updated = false, review_created = false
          WHERE id = $1`, [id]
      );

      const returned = await orders.update(id, { [flag]: true }, {}, c);
      assert.equal(returned?.id, id, `${flag} did not report the row it changed`);

      const row = await orderRow(c, id);
      assert.equal(row[flag], true, `${flag} was not set`);
      for (const other of FLAGS) {
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
