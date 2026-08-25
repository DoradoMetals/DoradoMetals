// The checkout session written to both schemas at once.
//
// This feature is the one where the two schemas disagree most about shape:
// exchange keeps the two directions in separate tables and puts a piece of
// scrap in its own row, while the new schema has one checkouts table with a
// direction and one items table carrying the scrap values inline. There is no
// shared id to mirror on, so the tests are about the two ending up EQUIVALENT
// rather than identical.
//
// Each runs inside a transaction that is rolled back, so no real cart moves.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import { LOCKS } from "#shared/testing/locks.js";
import * as dual from "#features/checkout/repo.dual.js";
import * as next from "#features/checkout/repo.next.js";

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


// The scrap sweep needs the table to itself.
//
// deleteOrphanScrap deletes from exchange.scrap after the caller has changed
// exchange.sell_cart_items, and `node --test` runs files in parallel - so this
// file and repo.dual.test.js took locks on the same two tables in opposite
// orders and deadlocked. A transaction-scoped advisory lock serialises the
// tests that touch the sweep, across files, and is released by the rollback.
const SCRAP_SWEEP_LOCK = LOCKS.SCRAP_SWEEP;

async function inRollback(fn) {
  await client.query("BEGIN");
  try {
    // Same lock as repo.exchange.test.js: replaceSellCart runs the scrap sweep.
    await client.query("SELECT pg_advisory_xact_lock($1)", [SCRAP_SWEEP_LOCK]);
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

const aUser = async (c) =>
  (await c.query(
    `SELECT u.id FROM exchange.users u
      WHERE EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id)
      ORDER BY u.id LIMIT 1`
  )).rows[0];

const aProduct = async (c) =>
  (await c.query(
    `SELECT p.id, p.product_name FROM exchange.products p
      WHERE EXISTS (SELECT 1 FROM products.bullion b WHERE b.id = p.id)
      ORDER BY p.id LIMIT 1`
  )).rows[0];

test("a buy cart lands in both schemas with the same products", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);
    const product = await aProduct(c);
    assert.ok(user && product, "dev has no user or product shared by both schemas");

    await dual.replaceCart(user.id, [{ id: product.id, quantity: 3 }], c);

    const { rows: ex } = await c.query(
      `SELECT ci.product_id, ci.quantity FROM exchange.cart_items ci
       JOIN exchange.carts ca ON ca.id = ci.cart_id WHERE ca.user_id = $1`,
      [user.id]
    );
    const { rows: nx } = await c.query(
      `SELECT ci.bullion_id AS product_id, ci.quantity FROM checkout.items ci
       JOIN checkout.checkouts co ON co.id = ci.checkout_id
       WHERE co.user_id = $1 AND co.direction = 'sale'`,
      [user.id]
    );

    assert.equal(ex.length, 1, "no line in exchange");
    assert.equal(nx.length, 1, "no line in checkout");
    assert.equal(ex[0].product_id, nx[0].product_id, "different products");
    assert.equal(Number(ex[0].quantity), Number(nx[0].quantity));
  });
});

// The direction is what replaces two tables, so a sell cart must not land in
// the buy checkout and vice versa.
test("a sell cart lands under the purchase direction, not the sale one", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);

    await dual.replaceSellCart(
      user.id,
      [{ type: "scrap", quantity: 2, data: {
        id: "11111111-1111-4111-8111-111111111111",
        metal: "Gold", pre_melt: 5, post_melt: 4, purity: 0.916, bid_premium: 0.8,
      } }],
      c
    );

    const { rows } = await c.query(
      `SELECT co.direction, count(ci.id)::int AS items
       FROM checkout.checkouts co
       LEFT JOIN checkout.items ci ON ci.checkout_id = co.id
       WHERE co.user_id = $1 GROUP BY co.direction`,
      [user.id]
    );
    const purchase = rows.find((r) => r.direction === "purchase");
    assert.ok(purchase, "no purchase-direction checkout was created");
    assert.equal(purchase.items, 1);
    assert.ok(
      !rows.some((r) => r.direction === "sale" && r.items > 0),
      "a sell cart line landed in the buy checkout"
    );
  });
});

// The unification: a scrap line has no separate row, it carries its own values
// and is identified by having no bullion.
test("a scrap line carries its values inline and has no bullion", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);

    await dual.replaceSellCart(
      user.id,
      [{ type: "scrap", quantity: 1, data: {
        id: "22222222-2222-4222-8222-222222222222",
        metal: "Silver", pre_melt: 12.5, post_melt: 11, purity: 0.925, bid_premium: 0.7,
      } }],
      c
    );

    const { rows } = await c.query(
      `SELECT ci.bullion_id, ci.pre_melt, ci.post_melt, ci.purity, ci.premium,
              m.name AS metal
       FROM checkout.items ci
       JOIN checkout.checkouts co ON co.id = ci.checkout_id
       LEFT JOIN metals.metals m ON m.id = ci.metal_id
       WHERE co.user_id = $1 AND co.direction = 'purchase'`,
      [user.id]
    );
    assert.equal(rows.length, 1);
    const [line] = rows;
    assert.equal(line.bullion_id, null, "a scrap line should have no bullion");
    assert.equal(Number(line.pre_melt), 12.5);
    assert.equal(Number(line.purity), 0.925);
    assert.equal(Number(line.premium), 0.7);
    assert.equal(line.metal, "Silver", "the metal was not resolved by name");
  });
});

// Replacing means replacing: the second sync must not leave the first behind.
test("replacing a cart empties both schemas first", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);
    const product = await aProduct(c);

    await dual.replaceCart(user.id, [{ id: product.id, quantity: 1 }], c);
    await dual.replaceCart(user.id, [{ id: product.id, quantity: 9 }], c);

    const { rows: ex } = await c.query(
      `SELECT ci.quantity FROM exchange.cart_items ci
       JOIN exchange.carts ca ON ca.id = ci.cart_id WHERE ca.user_id = $1`, [user.id]
    );
    const { rows: nx } = await c.query(
      `SELECT ci.quantity FROM checkout.items ci
       JOIN checkout.checkouts co ON co.id = ci.checkout_id
       WHERE co.user_id = $1 AND co.direction = 'sale'`, [user.id]
    );
    assert.equal(ex.length, 1, "exchange kept the old line");
    assert.equal(nx.length, 1, "checkout kept the old line");
    assert.equal(Number(ex[0].quantity), 9);
    assert.equal(Number(nx[0].quantity), 9);
  });
});

// One checkout per user per direction - the constraint 068 added. Syncing twice
// must reuse the session rather than opening a second one.
test("syncing twice reuses one checkout per direction", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);
    const product = await aProduct(c);

    await dual.replaceCart(user.id, [{ id: product.id, quantity: 1 }], c);
    await dual.replaceCart(user.id, [{ id: product.id, quantity: 2 }], c);

    const { rows } = await c.query(
      `SELECT count(*)::int AS n FROM checkout.checkouts
       WHERE user_id = $1 AND direction = 'sale'`, [user.id]
    );
    assert.equal(rows[0].n, 1, "a second checkout session was opened");
  });
});

// The write must join the caller's transaction, or a cart can be replaced in
// one schema and not the other.
test("a rolled-back sync leaves neither schema changed", async () => {
  const other = await pool.connect();
  try {
    const user = await aUser(other);
    const product = await aProduct(other);

    const before = await other.query(
      `SELECT (SELECT count(*)::int FROM checkout.items ci
                JOIN checkout.checkouts co ON co.id = ci.checkout_id
               WHERE co.user_id = $1 AND co.direction = 'sale') AS n`, [user.id]
    );

    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [SCRAP_SWEEP_LOCK]);
    await dual.replaceCart(user.id, [{ id: product.id, quantity: 7 }], client);

    const outside = await other.query(
      `SELECT (SELECT count(*)::int FROM checkout.items ci
                JOIN checkout.checkouts co ON co.id = ci.checkout_id
               WHERE co.user_id = $1 AND co.direction = 'sale') AS n`, [user.id]
    );
    assert.equal(outside.rows[0].n, before.rows[0].n, "the write escaped its transaction");

    await client.query("ROLLBACK");

    const after = await other.query(
      `SELECT (SELECT count(*)::int FROM checkout.items ci
                JOIN checkout.checkouts co ON co.id = ci.checkout_id
               WHERE co.user_id = $1 AND co.direction = 'sale') AS n`, [user.id]
    );
    assert.equal(after.rows[0].n, before.rows[0].n, "a rolled-back sync survived");
  } finally {
    other.release();
  }
});
