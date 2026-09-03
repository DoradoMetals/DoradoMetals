// Order creation writes, against real Postgres, each test rolled back.
//
// 086 REMOVED OFFERS and D212 removed the exchange twin. What survives is the
// order itself, its engagement, its number, and spots_locked - the one offer
// column worth keeping, now on orders.orders.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import * as writes from "#domain/orders/write.service.ts";

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

test("a new order lands with its direction, status and number", async () => {
  await inRollback(async (c: PoolClient) => {
    const userId = await aUser(c);
    const addressId = await anAddress(c);
    assert.ok(userId && addressId, "dev needs a user and an address");

    const id = await writes.insertPurchaseOrder(c, { userId, addressId, status: "Pending", by: "test" });

    const nx = await c.query(
      "SELECT id, direction, status, number FROM orders.orders WHERE id = $1", [id]
    );
    assert.equal(nx.rows.length, 1, "the order was not written");
    assert.equal(nx.rows[0].direction, "purchase", "the order was not created as a purchase");
    assert.equal(nx.rows[0].status, "Pending");
    assert.ok(nx.rows[0].number > 0, "the order drew no number from the sequence");
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

test("two orders draw two distinct, increasing numbers", async () => {
  await inRollback(async (c: PoolClient) => {
    const userId = await aUser(c);
    const addressId = await anAddress(c);
    assert.ok(userId && addressId, "dev needs a user and an address");

    const first = await writes.insertPurchaseOrder(c, { userId, addressId, status: "Pending", by: "test" });
    const second = await writes.insertPurchaseOrder(c, { userId, addressId, status: "Pending", by: "test" });

    const { rows } = await c.query(
      "SELECT id, number FROM orders.orders WHERE id = ANY($1::uuid[]) ORDER BY number",
      [[first, second]]
    );
    assert.equal(rows.length, 2);
    assert.ok(
      Number(rows[1].number) > Number(rows[0].number),
      "the sequence did not advance between two creates"
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

// The write must join the caller's transaction, or a rolled-back order
// creation would leave rows behind.
test("rolling back undoes the order", async () => {
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

    const { rows } = await other.query("SELECT id FROM orders.orders WHERE id = $1", [id]);
    assert.equal(rows.length, 0, "orders.orders kept a row from a rolled-back creation");
  } finally {
    other.release();
  }
});
