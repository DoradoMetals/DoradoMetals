// The exchange implementation of the checkout session, against real Postgres.
//
// These test exchange's own idiom - ensureCart's upsert, the scrap row a sell
// cart line points at, and the orphan sweep - none of which the new schema has,
// because there scrap and bullion are one table and a line carries its own
// values. So they belong to repo.exchange rather than to the switch.
//
// This is the feature that took checkout down in August: two functions were
// missing an `await`, and the failure hid behind a swallowed catch for months.
// The tests below are mostly about the properties that made that possible -
// something returning a promise where a value was expected, and something
// deleting more than its caller imagines.
//
// Each test runs inside a transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as repo from "#features/checkout/repo.exchange.js";

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
const SCRAP_SWEEP_LOCK = 4207;

async function inRollback(fn) {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock($1)", [SCRAP_SWEEP_LOCK]);
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

const aUser = async (c) =>
  (await c.query("SELECT id FROM exchange.users ORDER BY id LIMIT 1")).rows[0].id;

describe_ensure: {
  // ensureCart is the function the August outage was about. It returns an id,
  // and a caller that forgets to await it gets a promise that is truthy, passes
  // every guard, and then fails as a foreign key deeper in checkout.
  test("ensureCart returns an id, not a promise", async () => {
    await inRollback(async (c) => {
      const id = await repo.ensureCart(await aUser(c), c);
      assert.equal(typeof id, "string");
      assert.match(id, /^[0-9a-f-]{36}$/);
    });
  });

  // The ON CONFLICT/SELECT pair exists so two concurrent calls cannot both
  // insert. Called twice it must give the same cart, not a second one.
  test("ensureCart is idempotent for a user", async () => {
    await inRollback(async (c) => {
      const user = await aUser(c);
      const first = await repo.ensureCart(user, c);
      const second = await repo.ensureCart(user, c);
      assert.equal(first, second);

      const { rows } = await c.query(
        "SELECT count(*)::int n FROM exchange.carts WHERE user_id = $1", [user]
      );
      assert.equal(rows[0].n, 1, "a second cart was created for the same user");
    });
  });

  test("ensureSellCart is idempotent too", async () => {
    await inRollback(async (c) => {
      const user = await aUser(c);
      assert.equal(await repo.ensureSellCart(user, c), await repo.ensureSellCart(user, c));
    });
  });
}

test("getCart returns the wire shape the frontend reads", async () => {
  await inRollback(async (c) => {
    const { rows } = await c.query(
      "SELECT user_id FROM exchange.carts c JOIN exchange.cart_items i ON i.cart_id = c.id LIMIT 1"
    );
    if (!rows.length) return;
    const items = await repo.getCart(rows[0].user_id);
    assert.ok(items.length);
    for (const key of ["cart_item_id", "product_id", "quantity", "metal_type", "mint_name"]) {
      assert.ok(key in items[0], `${key} missing from the cart shape`);
    }
  });
});

// deleteOrphanScrap runs on EVERY sell-cart sync, and it is not scoped to the
// user syncing: it deletes any scrap row in the whole table that no cart item
// and no purchase order item references.
//
// That is its intended job. The tests below pin both halves of it, because the
// second half is the one nobody would expect from the name.
describe_orphans: {
  test("deletes scrap that nothing references", async () => {
    await inRollback(async (c) => {
      const orphan = randomUUID();
      const { rows: [metal] } = await c.query("SELECT id FROM exchange.metals LIMIT 1");
      await c.query(
        `INSERT INTO exchange.scrap (id, metal_id, pre_melt, purity, content, gross_unit)
         VALUES ($1, $2, 1, 0.9, 0.9, 't oz')`, [orphan, metal.id]
      );

      await repo.deleteOrphanScrap(c);

      const { rows } = await c.query("SELECT 1 FROM exchange.scrap WHERE id = $1", [orphan]);
      assert.equal(rows.length, 0);
    });
  });

  test("keeps scrap a purchase order item still points at", async () => {
    await inRollback(async (c) => {
      const { rows } = await c.query(
        "SELECT scrap_id FROM exchange.purchase_order_items WHERE scrap_id IS NOT NULL LIMIT 1"
      );
      if (!rows.length) return;
      await repo.deleteOrphanScrap(c);
      const still = await c.query("SELECT 1 FROM exchange.scrap WHERE id = $1", [rows[0].scrap_id]);
      assert.equal(still.rows.length, 1, "scrap belonging to an order was deleted");
    });
  });

  // The blast radius. `NOT IN` over two subqueries that return nothing is true
  // for every row, so if both reference tables were ever empty - a bad
  // migration, a failed restore - the next cart sync deletes the entire scrap
  // table. On production that is 105 rows carrying the assay figures: what a
  // parcel of scrap actually turned out to weigh once melted, which exists
  // nowhere else.
  //
  // This test asserts the behaviour rather than a fix, because changing what
  // checkout does is not something to do on a hunch. See FOLLOWUPS.
  test("with nothing referencing scrap at all, it deletes every row", async () => {
    await inRollback(async (c) => {
      // Scoped to the rows that exist when this transaction starts, rather than
      // to a count of the table. `node --test` runs files in parallel and
      // features/purchase-orders/service.test.js commits scrap fixtures - the
      // services open their own transactions, so it has to - and a row that
      // appears mid-test is referenced, not an orphan, so a bare count is
      // flaky. The claim being made is the same: everything unreferenced goes.
      const { rows: before } = await c.query("SELECT id FROM exchange.scrap");
      assert.ok(before.length > 0, "no scrap to test with");

      await c.query("DELETE FROM exchange.sell_cart_items");
      await c.query("DELETE FROM exchange.purchase_order_items");
      await repo.deleteOrphanScrap(c);

      const { rows: survivors } = await c.query(
        "SELECT id FROM exchange.scrap WHERE id = ANY($1::uuid[])",
        [before.map((r) => r.id)]
      );
      assert.deepEqual(
        survivors, [],
        "the guard this test documents has been added - update the test"
      );
    });
  });
}

test("a cart write on a client is invisible on another connection", async () => {
  const other = await pool.connect();
  await client.query("BEGIN");
  try {
    const user = await aUser(client);
    const cartId = await repo.ensureCart(user, client);
    const sentinel = randomUUID();
    await client.query(
      "UPDATE exchange.carts SET id = id WHERE id = $1", [cartId]
    );
    await client.query(
      `INSERT INTO exchange.cart_items (id, cart_id, product_id, quantity)
       SELECT $1, $2, id, 1 FROM exchange.products LIMIT 1`, [sentinel, cartId]
    );

    const inside = await client.query("SELECT 1 FROM exchange.cart_items WHERE id = $1", [sentinel]);
    assert.equal(inside.rows.length, 1, "the write did not happen at all");

    const seen = await other.query("SELECT 1 FROM exchange.cart_items WHERE id = $1", [sentinel]);
    assert.equal(seen.rows.length, 0, "an uncommitted cart item was visible elsewhere");
  } finally {
    await client.query("ROLLBACK");
    other.release();
  }
});
