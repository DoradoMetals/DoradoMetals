// The writes on orders.addresses, against real Postgres.
//
// NO update AND NO remove, deliberately: an order's address snapshot is
// immutable (Jacob, D84). Re-recording one is a CORRECTION of the link, not a
// second link, so `create` is an upsert on order_id and that is the whole write
// surface - which is what these tests pin.
//
// Each test runs inside a transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import * as addresses from "#db/orders/addresses/repo.ts";

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

const twoAddresses = async (c: PoolClient) =>
  (await c.query("SELECT id FROM places.addresses ORDER BY id LIMIT 2")).rows;

test("a second link for the same order corrects the first rather than adding one", async () => {
  await inRollback(async (c: PoolClient) => {
    const order_id = await anOrder(c);
    assert.ok(order_id, "orders.orders is empty - this test proves nothing");
    const books = await twoAddresses(c);
    assert.equal(books.length, 2, "places.addresses needs two rows for this test to mean anything");

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
    const order_id = await anOrder(c);
    assert.ok(order_id, "orders.orders is empty");
    const books = await twoAddresses(c);
    assert.ok(books.length > 0, "places.addresses is empty");

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
