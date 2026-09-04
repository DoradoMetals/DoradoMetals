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
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";
import { rollbackIn } from "#shared/testing/rollback.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { aUser } from "#shared/testing/builders/index.ts";
import * as orders from "#db/orders/repo.ts";


beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

// LOCKS.ORDERS, transaction-scoped (lane 3, the runner conversion): this
// file's own INSERTs on orders.orders roll back, but a concurrent reader
// that also reads orders.orders inside a query started before this test's
// own rows exist and finished after ROLLBACK would just see nothing - what
// this lock guards against is domain/orders/tests/edit-line.test.ts, which
// writes real, autocommitting rows to the same table under LOCKS.ORDERS; see
// domain/orders/tests/purchase-read.test.ts's own comment for the full
// mechanism.
// THE FILE'S LOCK, BOUND ONCE. A lock is a property of what this file
// WRITES, not of one call, so it is named here and every inRollback below
// inherits it - which is also what stops a new test being added without one.
const inRollback = rollbackIn({ lock: LOCKS.ORDERS });

test("a new order lands with its direction, status and number", async () => {
  await inRollback(async (c: PoolClient) => {
    const user_id = (await aUser(c)).id;

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
    const user_id = (await aUser(c)).id;

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
    const user_id = (await aUser(c)).id;

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
  // TWO CONNECTIONS, DELIBERATELY: the id is written inside a transaction that
  // is rolled back and then looked for from OUTSIDE it, which is the only way
  // to tell "the write joined my transaction" from "the write committed".
  //
  // THE CUSTOMER IS THE SEEDED TEST ACTOR rather than a built one, and that is
  // the point of the seed: user_id is a foreign key, so the row it names has
  // to be COMMITTED - and a builder's user is not, by design. Committing one
  // here would mean deleting it afterwards, from a frozen table.
  const outside = await pool.connect();
  const writer = await pool.connect();
  try {
    await writer.query("BEGIN");
    const { id } = await orders.create(
      { user_id: TEST_ACTOR.id, direction: "purchase", status: "Pending" }, writer
    );
    await writer.query("ROLLBACK");

    const { rows } = await outside.query("SELECT id FROM orders.orders WHERE id = $1", [id]);
    assert.equal(rows.length, 0, "orders.orders kept a row from a rolled-back creation");
  } finally {
    outside.release();
    writer.release();
  }
});
