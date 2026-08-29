// Service-level atomicity for the two operations that delete or reprice.
//
// The executor problem has a mirror image at this layer: a service that makes
// several repo calls without a transaction commits each one separately, so a
// failure partway leaves half the work done. These two were doing exactly that.
//
// deleteOrderItems is the one that mattered.
// exchange.purchase_order_items.scrap_id is ON DELETE SET NULL, so if the scrap
// delete committed and the item delete then failed, the scrap rows were gone -
// weights, purity, and the assay figures recording what was actually recovered
// from a customer's parcel - while the order lines survived pointing at
// nothing. Those figures exist nowhere else.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";
import * as service from "#features/orders/service.ts";
import * as scrapRepo from "#features/scrap/repo.ts";

let client: PoolClient;

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();

  // THE ORDERS LOCK, HELD FOR THE WHOLE FILE - and a SESSION lock, not the
  // transaction-scoped one every other file uses.
  //
  // locks.ts records this file as one of the eight that "were given their
  // locks". It was given the IMPORT and never the CALL; `takeLocks` has been
  // imported and unused since the file was written, in HEAD as well as here.
  // It stayed latent exactly as that file predicts - "a missing lock is latent
  // until timing changes, and timing changes for reasons that have nothing to
  // do with the file that fails" - and surfaced on 2026-08-29 as a DEADLOCK in
  // refiner-edits.test.js, which applies a migration (DDL locks) while this
  // file's cleanup deletes refiners.items / refiners.spots / refiners.orders.
  //
  // takeLocks() cannot be used here: it takes pg_advisory_xact_lock, and THIS
  // FILE HAS NO TRANSACTIONS. Every statement autocommits, so a
  // transaction-scoped lock would be released before the next statement ran.
  // A session lock contends in the same lock space, so it serialises correctly
  // against every file that takes ORDERS the ordinary way.
  await client.query("SELECT pg_advisory_lock($1)", [LOCKS.ORDERS]);
});

after(async () => {
  await client.query("SELECT pg_advisory_unlock($1)", [LOCKS.ORDERS]);
  client.release();
  await pool.end();
});

// Builds a purchase order with one scrap line, on the given connection.
const anOrderWithScrap = async (c: PoolClient) => {
  const { rows: [metal] } = await c.query("SELECT id FROM exchange.metals LIMIT 1");
  const { rows: [user] } = await c.query("SELECT id FROM exchange.users LIMIT 1");
  const { rows: [order] } = await c.query(
    `INSERT INTO exchange.purchase_orders (id, user_id, purchase_order_status)
     VALUES (gen_random_uuid(), $1, 'Pending') RETURNING id`, [user.id]
  );
  const { rows: [scrap] } = await c.query(
    `INSERT INTO exchange.scrap (id, metal_id, pre_melt, purity, content, gross_unit, bid_premium)
     VALUES (gen_random_uuid(), $1, 10, 0.9, 9, 't oz', 0.75) RETURNING id`, [metal.id]
  );
  const { rows: [item] } = await c.query(
    `INSERT INTO exchange.purchase_order_items (id, purchase_order_id, scrap_id, quantity, confirmed)
     VALUES (gen_random_uuid(), $1, $2, 1, false) RETURNING id`, [order.id, scrap.id]
  );
  return { orderId: order.id, scrapId: scrap.id, itemId: item.id };
};

// The services open their own transactions, so these tests cannot run inside
// one - a rolled-back outer transaction would not see the service's commit.
// They clean up after themselves instead, on a second connection.
// BOTH SCHEMAS. This used to delete the three exchange tables its author was
// thinking about (lesson ao) - and once dual became the default, the services
// mirrored every fixture into orders.* and refiners.*, which nothing removed.
// That is where the stray orders came from: this file leaked one order per run
// into the new schema, invisibly, because a test reads its own writes either
// way. Scoped strictly to THIS fixture's ids - it deletes what it created.
const cleanup = async (c: PoolClient, { orderId, scrapId }: { orderId: string; scrapId: string }) => {
  await c.query("DELETE FROM exchange.purchase_order_items WHERE purchase_order_id = $1", [orderId]);
  await c.query("DELETE FROM exchange.scrap WHERE id = $1", [scrapId]);
  await c.query("DELETE FROM exchange.purchase_orders WHERE id = $1", [orderId]);
  await c.query(
    "DELETE FROM refiners.items WHERE order_item_id IN (SELECT id FROM orders.items WHERE order_id = $1)",
    [orderId]
  );
  // The ENGAGEMENT (093) and its spot mirrors: every order is born with a
  // refiners.orders row now, and refiners.orders.order_id has a plain FK -
  // deleting the order first raises 23503.
  await c.query("DELETE FROM refiners.spots WHERE order_id = $1", [orderId]);
  await c.query("DELETE FROM refiners.orders WHERE order_id = $1", [orderId]);
  for (const t of ["orders.items", "orders.spots", "orders.transactions", "orders.addresses"]) {
    await c.query(`DELETE FROM ${t} WHERE order_id = $1`, [orderId]);
  }
  await c.query("DELETE FROM orders.orders WHERE id = $1", [orderId]);
};

test("deleting a line removes the scrap and the item together", async () => {
  const fixture = await anOrderWithScrap(client);
  try {
    await service.deleteOrderItems({
      items: [{ id: fixture.itemId, scrap: { id: fixture.scrapId }, purchase_order_id: fixture.orderId }],
    });

    const item = await client.query("SELECT 1 FROM exchange.purchase_order_items WHERE id = $1", [fixture.itemId]);
    const scrap = await client.query("SELECT 1 FROM exchange.scrap WHERE id = $1", [fixture.scrapId]);
    assert.equal(item.rows.length, 0, "the order line survived");
    assert.equal(scrap.rows.length, 0, "the scrap row survived");
  } finally {
    await cleanup(client, fixture);
  }
});

// The property the transaction buys. If anything after the scrap delete throws,
// the scrap must come back - otherwise the assay record is gone and the line
// that referenced it is still there, orphaned by the SET NULL.
test("a failure after the scrap delete leaves the scrap intact", async () => {
  const fixture = await anOrderWithScrap(client);
  try {
    // An id that is not a uuid makes the item delete throw, after the scrap
    // delete has already run inside the same transaction.
    await assert.rejects(() =>
      service.deleteOrderItems({
        items: [
          { id: fixture.itemId, scrap: { id: fixture.scrapId }, purchase_order_id: fixture.orderId },
          { id: "not-a-uuid", scrap: { id: null }, purchase_order_id: fixture.orderId },
        ],
      })
    );

    const scrap = await client.query("SELECT 1 FROM exchange.scrap WHERE id = $1", [fixture.scrapId]);
    const item = await client.query("SELECT 1 FROM exchange.purchase_order_items WHERE id = $1", [fixture.itemId]);
    assert.equal(scrap.rows.length, 1, "the assay record was lost to a partial failure");
    assert.equal(item.rows.length, 1, "the order line was deleted without its scrap");
  } finally {
    await cleanup(client, fixture);
  }
});

// A bullion line has no scrap, and `item.scrap?.id` is undefined rather than
// null - which the original `!== null` filter let through, asking the database
// to delete a row with no id.
test("a bullion line contributes no scrap id to delete", async () => {
  const fixture = await anOrderWithScrap(client);
  const { rows: [product] } = await client.query("SELECT id FROM exchange.products LIMIT 1");
  const { rows: [bullion] } = await client.query(
    `INSERT INTO exchange.purchase_order_items (id, purchase_order_id, product_id, quantity, confirmed)
     VALUES (gen_random_uuid(), $1, $2, 1, false) RETURNING id`, [fixture.orderId, product.id]
  );
  try {
    await service.deleteOrderItems({
      items: [{ id: bullion.id, purchase_order_id: fixture.orderId }],
    });
    // The scrap on the other line is untouched.
    const scrap = await client.query("SELECT 1 FROM exchange.scrap WHERE id = $1", [fixture.scrapId]);
    assert.equal(scrap.rows.length, 1, "deleting a bullion line removed unrelated scrap");
  } finally {
    await cleanup(client, fixture);
  }
});

// updateScrapItem writes the weights and the premium separately, and both feed
// content * spot * premium. Applying one without the other quotes a price from
// a mix of old figures and new.
test("editing a scrap line applies the weights and the premium together", async () => {
  const fixture = await anOrderWithScrap(client);
  try {
    await service.updateScrapItem({
      // DELIBERATELY THE PAYLOAD THE REAL CALLER SENDS, which is not the
      // payload the signature demands. updateScrapItem declares
      // `item: OrderScrapItemRow & Record<string, any>` - requiring `metal`
      // and `content` at the top level - and then reads only `item.id`,
      // `item.premium` and `item.scrap.*`. The same over-declaration as
      // `bid.ts`'s ComposedItem (D136's wave-4 find). @ts-expect-error rather
      // than padding the fixture with fields the service never looks at: this
      // FAILS the moment the signature is narrowed to what it reads, which
      // forces the comment out instead of leaving a lie in the fixture.
      // @ts-expect-error - the declared row is wider than the code reads
      item: {
        id: fixture.itemId,
        premium: 0.82,
        scrap: {
          id: fixture.scrapId, pre_melt: 10, post_melt: 8, purity: 0.5,
          gross_unit: "t oz", bid_premium: 0.82,
        },
      },
    });

    const { rows: [scrap] } = await client.query(
      "SELECT content FROM exchange.scrap WHERE id = $1", [fixture.scrapId]
    );
    const { rows: [item] } = await client.query(
      "SELECT premium FROM exchange.purchase_order_items WHERE id = $1", [fixture.itemId]
    );
    assert.equal(Number(scrap.content), 4, "8 post-melt at 0.5 purity");
    assert.equal(Number(item.premium), 0.82);
  } finally {
    await cleanup(client, fixture);
  }
});
