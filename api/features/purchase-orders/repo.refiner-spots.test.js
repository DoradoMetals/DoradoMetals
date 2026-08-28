// The refiner's spot for an order, mirrored into refiners.spots.
//
// exchange.refiner_metals was the last thing on a purchase order for which
// exchange was the only copy. 070 derives refiners.spots from it, the same
// transformation that turned order_metals into orders.spots, and the writes are
// mirrored like every other.
//
// The one difference worth testing: refiners.spots keeps the source id, where
// orders.spots generates its own. That is what lets a row be matched directly
// rather than by (order, metal), and it is what the mirror conflicts on.
//
// Each test runs inside a transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";
import * as dual from "#features/purchase-orders/repo.dual.js";
import * as next from "#features/purchase-orders/repo.next.ts";

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
  await takeLocks(client, [LOCKS.ADDRESSES, LOCKS.ORDERS]);
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

const anOrderWithRefinerSpots = async (c) =>
  (await c.query(
    `SELECT m.purchase_order_id AS id, m.type
       FROM exchange.refiner_metals m
      WHERE m.purchase_order_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM orders.orders o WHERE o.id = m.purchase_order_id)
      ORDER BY m.purchase_order_id, m.type LIMIT 1`
  )).rows[0];

// DEMOTED with the read pivot (ruling 8): the exchange read implementation is
// gone, so the comparison is the READ against the RAW exchange rows the dual
// write still maintains - same question, one implementation.
test("the read agrees with the raw exchange rows the dual write maintains", async () => {
  const order = await anOrderWithRefinerSpots(client);
  assert.ok(order, "dev has no refiner metals on a migrated order");

  const { rows: raw } = await client.query(
    `SELECT m.id, m.type AS name, m.ask_spot AS ask, m.bid_spot AS bid
       FROM exchange.refiner_metals m
      WHERE m.purchase_order_id = $1
      ORDER BY m.type ASC, m.id ASC`,
    [order.id]
  );
  const b = await next.findRefinerMetalsByOrderId(order.id);
  assert.ok(raw.length > 0, "exchange returned nothing to compare");
  assert.deepEqual(
    b.map((r) => ({ id: r.id, name: r.name, ask: Number(r.ask), bid: Number(r.bid) })),
    raw.map((r) => ({ id: r.id, name: r.name, ask: Number(r.ask), bid: Number(r.bid) }))
  );
});

test("a spot write reaches both schemas", async () => {
  await inRollback(async (c) => {
    const order = await anOrderWithRefinerSpots(c);

    await dual.updateRefinerSpot(
      { spot: { purchase_order_id: order.id, name: order.type }, updated_spot: 1234.56 },
      c
    );

    const { rows: ex } = await c.query(
      `SELECT bid_spot FROM exchange.refiner_metals
        WHERE purchase_order_id = $1 AND type = $2`,
      [order.id, order.type]
    );
    const { rows: nx } = await c.query(
      `SELECT s.bid FROM refiners.spots s
       JOIN metals.metals m ON m.id = s.metal_id
        WHERE s.order_id = $1 AND m.name = $2`,
      [order.id, order.type]
    );
    assert.equal(Number(ex[0].bid_spot), 1234.56);
    assert.equal(Number(nx[0].bid), 1234.56, "the refiner spot did not reach the new schema");
  });
});

// The mirror keys on the source id, so a row must not be duplicated by a second
// write to the same order and metal.
test("mirroring twice does not duplicate a spot", async () => {
  await inRollback(async (c) => {
    const order = await anOrderWithRefinerSpots(c);

    await dual.updateRefinerSpot(
      { spot: { purchase_order_id: order.id, name: order.type }, updated_spot: 10 }, c
    );
    await dual.updateRefinerSpot(
      { spot: { purchase_order_id: order.id, name: order.type }, updated_spot: 20 }, c
    );

    const { rows } = await c.query(
      `SELECT count(*)::int n FROM refiners.spots s
       JOIN metals.metals m ON m.id = s.metal_id
        WHERE s.order_id = $1 AND m.name = $2`,
      [order.id, order.type]
    );
    assert.equal(rows[0].n, 1, "the mirror created a second row for the same metal");
  });
});

// exchange has never recorded which refinery an order went to. The mirror must
// not overwrite a refiner_id that is already there with a null.
test("the mirror does not clear a refiner_id it cannot derive", async () => {
  await inRollback(async (c) => {
    const order = await anOrderWithRefinerSpots(c);
    const { rows: [refiner] } = await c.query(`SELECT id FROM refiners.refiners LIMIT 1`);
    assert.ok(refiner, "dev has no refiner to attribute a spot to");

    await c.query(
      `UPDATE refiners.spots s SET refiner_id = $2
       FROM metals.metals m
       WHERE m.id = s.metal_id AND s.order_id = $1 AND m.name = $3`,
      [order.id, refiner.id, order.type]
    );

    await next.mirrorRefinerSpots(order.id, c);

    const { rows } = await c.query(
      `SELECT s.refiner_id FROM refiners.spots s
       JOIN metals.metals m ON m.id = s.metal_id
        WHERE s.order_id = $1 AND m.name = $2`,
      [order.id, order.type]
    );
    assert.equal(rows[0].refiner_id, refiner.id, "the mirror nulled a refiner_id");
  });
});
