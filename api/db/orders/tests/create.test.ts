// The CREATE on orders.orders, against real Postgres, each test rolled back.
//
// One statement for both directions. What it has to get right: the direction
// and status it is given, a number drawn from THAT direction's own sequence,
// the columns nobody passes (spots_locked starts false - 086 removed
// orders.offers and this is the one column of it worth keeping), and joining
// the caller's transaction, because an order is created alongside its lines,
// its spots and its money.
//
// The composition around it - the refiner engagement, the mirrors, the address
// snapshot - is domain/orders/place.ts's and is pinned by place.test.ts.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import * as orders from "#db/orders/repo.ts";

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

test("a new order lands with its direction, status and number", async () => {
  await inRollback(async (c: PoolClient) => {
    const user_id = await aUser(c);
    assert.ok(user_id, "the test db needs a user");

    const { id, number } = await orders.create(
      { user_id, direction: "purchase", status: "Pending" }, c
    );

    const row = await orders.getOne(id, c);
    assert.ok(row, "the order was not written");
    assert.equal(row!.direction, "purchase", "the order was not created as a purchase");
    assert.equal(row!.status, "Pending");
    assert.ok(Number(number) > 0, "the order drew no number from the sequence");
    assert.equal(Number(row!.number), Number(number));
  });
});

test("each direction draws from its own sequence, and each draw advances it", async () => {
  await inRollback(async (c: PoolClient) => {
    const user_id = await aUser(c);
    assert.ok(user_id, "the test db needs a user");

    const first = await orders.create({ user_id, direction: "purchase", status: "Pending" }, c);
    const second = await orders.create({ user_id, direction: "purchase", status: "Pending" }, c);
    assert.ok(
      Number(second.number) > Number(first.number),
      "the sequence did not advance between two creates"
    );

    const sale = await orders.create({ user_id, direction: "sale", status: "Pending" }, c);
    const { rows } = await c.query(
      `SELECT direction FROM orders.orders WHERE id = $1`, [sale.id]
    );
    assert.equal(rows[0].direction, "sale");
  });
});

test("a new order starts with its spots unpinned", async () => {
  await inRollback(async (c: PoolClient) => {
    const user_id = await aUser(c);
    assert.ok(user_id, "the test db needs a user");

    const { id } = await orders.create(
      { user_id, direction: "purchase", status: "Pending" }, c
    );

    // 086 removed orders.offers. spots_locked moved onto the order itself,
    // because whether an order's metal prices are pinned is a property of the
    // order rather than of a negotiation that no longer exists.
    const { rows } = await c.query("SELECT spots_locked FROM orders.orders WHERE id = $1", [id]);
    assert.equal(rows[0].spots_locked, false, "a new order should start with its spots unpinned");
  });
});

// The write must join the caller's transaction, or a rolled-back creation
// would leave rows behind.
test("rolling back undoes the order", async () => {
  const other = await pool.connect();
  try {
    const user_id = await aUser(other);
    assert.ok(user_id, "the test db needs a user");

    await client.query("BEGIN");
    const { id } = await orders.create(
      { user_id, direction: "purchase", status: "Pending" }, client
    );
    await client.query("ROLLBACK");

    const { rows } = await other.query("SELECT id FROM orders.orders WHERE id = $1", [id]);
    assert.equal(rows.length, 0, "orders.orders kept a row from a rolled-back creation");
  } finally {
    other.release();
  }
});
