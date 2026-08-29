// Order creation writes, against real Postgres, each test rolled back.
//
// 086 REMOVED OFFERS. This file used to be about the offer row an order was
// created with; what survives is the order itself, its exchange twin, and
// spots_locked - the one offer column worth keeping, now on orders.orders.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import * as writes from "#features/orders/write.service.ts";

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

const aUser = async (c: PoolClient) =>
  (await c.query("SELECT id FROM exchange.users LIMIT 1")).rows[0]?.id ?? null;
const anAddress = async (c: PoolClient) =>
  (await c.query("SELECT id FROM exchange.addresses LIMIT 1")).rows[0]?.id ?? null;

test("a new order lands in both schemas with the same id", async () => {
  await inRollback(async (c: PoolClient) => {
    const userId = await aUser(c);
    const addressId = await anAddress(c);
    assert.ok(userId && addressId, "dev needs a user and an address");

    const id = await writes.insertPurchaseOrder(c, { userId, addressId, status: "Pending", by: "test" });

    const nx = await c.query(
      "SELECT id, direction, status, number FROM orders.orders WHERE id = $1", [id]
    );
    assert.equal(nx.rows.length, 1, "the order is not in the new schema");
    assert.equal(nx.rows[0].direction, "purchase", "the order was not created as a purchase");
    assert.equal(nx.rows[0].status, "Pending");
    assert.ok(nx.rows[0].number > 0, "the order got no number from exchange's sequence");

    const ex = await c.query(
      "SELECT id, purchase_order_status, order_number FROM exchange.purchase_orders WHERE id = $1",
      [id]
    );
    assert.equal(ex.rows.length, 1, "the order is not in exchange");
    assert.equal(ex.rows[0].purchase_order_status, "Pending");
  });
});

test("a new order is born with its refiner engagement - 093's invariant survives new traffic", async () => {
  await inRollback(async (c: PoolClient) => {
    const userId = await aUser(c);
    const addressId = await anAddress(c);
    assert.ok(userId && addressId, "dev needs a user and an address");

    const id = await writes.insertPurchaseOrder(c, { userId, addressId, status: "Pending", by: "test" });

    const ro = await c.query(
      "SELECT id, refiner_id, pool_oz_deducted, fee FROM refiners.orders WHERE order_id = $1", [id]
    );
    assert.equal(ro.rows.length, 1, "the order has no refiners.orders engagement row");
    assert.equal(ro.rows[0].refiner_id, null, "a new engagement names no refinery yet");
  });
});

test("both schemas hold the SAME order number - the sequence is drawn once", async () => {
  await inRollback(async (c: PoolClient) => {
    const userId = await aUser(c);
    const addressId = await anAddress(c);
    assert.ok(userId && addressId, "dev needs a user and an address");

    const id = await writes.insertPurchaseOrder(c, { userId, addressId, status: "Pending", by: "test" });

    // The dual create used to draw exchange's sequence TWICE - once explicitly
    // for orders.orders, once through exchange's column DEFAULT - so the same
    // order wore two numbers. The number is now threaded into the exchange
    // insert, and this is the pin that keeps it that way.
    const nx = await c.query("SELECT number FROM orders.orders WHERE id = $1", [id]);
    const ex = await c.query(
      "SELECT order_number FROM exchange.purchase_orders WHERE id = $1", [id]
    );
    assert.equal(
      Number(ex.rows[0].order_number), Number(nx.rows[0].number),
      "exchange and the new schema disagree about the order's number - the sequence was drawn twice"
    );
  });
});

test("a new order carries spots_locked, which is where the offer's one useful column went", async () => {
  await inRollback(async (c: PoolClient) => {
    const userId = await aUser(c);
    const addressId = await anAddress(c);
    assert.ok(userId && addressId, "dev needs a user and an address");

    const id = await writes.insertPurchaseOrder(c, { userId, addressId, status: "Pending", by: "test" });

    // 086 removed orders.offers. spots_locked moved onto the order itself,
    // because whether an order's metal prices are pinned is a property of the
    // order rather than of a negotiation that no longer exists. A new order
    // starts unpinned.
    const { rows } = await c.query("SELECT spots_locked FROM orders.orders WHERE id = $1", [id]);
    assert.equal(rows.length, 1, "the order was not written");
    assert.equal(rows[0].spots_locked, false, "a new order should start with its spots unpinned");
  });
});

// The write must join the caller's transaction, or a rolled-back order creation
// would leave rows behind in one schema or both.
test("rolling back undoes the order in both schemas", async () => {
  const other = await pool.connect();
  try {
    const userId = await aUser(other);
    const addressId = await anAddress(other);
    assert.ok(userId && addressId, "dev needs a user and an address");

    await client.query("BEGIN");
    const id = await writes.insertPurchaseOrder(client, {
      userId, addressId, status: "Pending", by: "test",
    });
    await client.query("ROLLBACK");

    for (const [table, sql] of [
      ["orders.orders", "SELECT id FROM orders.orders WHERE id = $1"],
      ["exchange.purchase_orders", "SELECT id FROM exchange.purchase_orders WHERE id = $1"],
    ]) {
      const { rows } = await other.query(sql, [id]);
      assert.equal(rows.length, 0, `${table} kept a row from a rolled-back creation`);
    }
  } finally {
    other.release();
  }
});
