// The writes on orders.addresses, against real Postgres.
//
// NO update AND NO remove, deliberately: an order's address snapshot is
// immutable (Jacob, D84). Re-recording one is a CORRECTION of the link, not a
// second link, so `create` is an upsert on order_id and that is the whole write
// surface - which is what these tests pin.
//
// Each test runs inside a transaction that is rolled back.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";
import { rollbackIn } from "#shared/testing/rollback.ts";
import { aUser, anAddress, anOrder } from "#shared/testing/builders/index.ts";
import * as addresses from "#db/orders/addresses/repo.ts";


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
// file picks an order off orders.orders as its FK anchor, and
// domain/orders/tests/edit-line.test.ts writes real, autocommitting rows to
// the same table under LOCKS.ORDERS - see domain/orders/tests/
// purchase-read.test.ts's own comment for the full mechanism.
// THE FILE'S LOCK, BOUND ONCE. A lock is a property of what this file
// WRITES, not of one call, so it is named here and every inRollback below
// inherits it - which is also what stops a new test being added without one.
const inRollback = rollbackIn({ lock: LOCKS.ORDERS });

// THE ORDER AND THE TWO ADDRESSES ARE BUILT (lane 1). The pair used to come
// off places.addresses with `LIMIT 2`, so "the correction landed" was a claim
// about two rows a customer owns, and a database holding one address made the
// test assert nothing at all.
const anOrderAndTwoAddresses = async (c: PoolClient) => {
  const user = await aUser(c);
  const order = await anOrder(c, user, { direction: "purchase" });
  const first = await anAddress(c, user, { city: "Dallas" });
  const second = await anAddress(c, user, { city: "Fresno", default_shipping: false });
  return { order_id: order.id, books: [first, second] };
};

test("a second link for the same order corrects the first rather than adding one", async () => {
  await inRollback(async (c: PoolClient) => {
    const { order_id, books } = await anOrderAndTwoAddresses(c);

    assert.equal(
      await addresses.create({ order_id, address_id: books[0].id, source_address_id: books[0].id }, c),
      true
    );
    assert.equal(
      await addresses.create({ order_id, address_id: books[1].id, source_address_id: books[1].id }, c),
      true
    );

    const { rows } = await c.query(
      "SELECT address_id FROM orders.addresses WHERE order_id = $1", [order_id]
    );
    assert.equal(rows.length, 1, "the second link added a row instead of correcting the first");
    assert.equal(rows[0].address_id, books[1].id, "the correction did not land");
  });
});

test("getFor reads the link back and getMany batches it", async () => {
  await inRollback(async (c: PoolClient) => {
    const { order_id, books } = await anOrderAndTwoAddresses(c);

    await addresses.create({ order_id, address_id: books[0].id, source_address_id: books[0].id }, c);

    const one = await addresses.getFor(order_id, c);
    assert.equal(one?.address_id, books[0].id);
    // THE SOURCE ID IS THE ONE THE WIRE RETURNS: the frontend posts it back at
    // checkout and the API resolves it against the book.
    assert.equal(one?.source_address_id, books[0].id);

    const many = await addresses.getMany([order_id], c);
    assert.equal(many.length, 1);
    assert.equal(many[0].order_id, order_id);

    assert.deepEqual(await addresses.getMany([], c), []);
  });
});
