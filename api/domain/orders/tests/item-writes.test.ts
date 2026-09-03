// The offer edits and the item writes an admin makes on a purchase order.
//
// Item edits from the undriven list (the offer tests left with 086), driven
// through the line's own endpoint (PATCH /api/orders/items/:id) and the
// order's line creation (POST /api/orders/:id/items) since the per-resource
// re-slice. All pure database work - checked each service function first.
//
// The offer state machine this header once described (Rejected/Resent and
// the price-clearing between them) left with 086, and the offer statuses
// themselves left the lifecycle in migration 092 - what remains here are the
// item writes.
//
// NOTHING IS COMMITTED. shared/testing/pinned-pool.js holds every query in one
// transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, asAdmin } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";

// Both tests write orders.items (and its refiners.items counterpart) - the
// scrap IS the line since D212. The lock declaration has to cover the tables
// the test writes TODAY: without ORDERS this file passed alone and 500'd in
// the full run, colliding with the order-placing files.
const ITEM_LOCKS = [LOCKS.SCRAP_SWEEP, LOCKS.ORDERS];

await mockSessions();
const { default: app } = await import("#app");

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS. These are SELECT
// projections, not table rows - naming a row type would claim columns the
// query never asked for.
type UserFixture = { id: string; name: string | null; email: string | null };
type OrderFixture = { id: string; user_id: string };
type ItemFixture = { id: string; purchase_order_id: string; premium: string | number | null };

let admin: UserFixture;
let customer: UserFixture;
let order: OrderFixture;
let bullionItem: ItemFixture;

before(async () => {
  admin = (
    await outside<UserFixture>(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`)
  )[0];
  assert.ok(admin, "dev has no admin user");

  order = (
    await outside<OrderFixture>(
      `SELECT id, user_id FROM orders.orders
        WHERE direction = 'purchase' AND user_id IS NOT NULL ORDER BY id LIMIT 1`
    )
  )[0];
  assert.ok(order, "dev needs a purchase order with a user");

  customer = (
    await outside<UserFixture>(`SELECT id, name, email FROM exchange.users WHERE id = $1`, [order.user_id])
  )[0];
  assert.ok(customer, "the fixture order's user is missing");

  // A bullion line - one with a product rather than scrap.
  bullionItem = (
    await outside<ItemFixture>(
      `SELECT i.id, i.order_id AS purchase_order_id, i.premium
         FROM orders.items i
         JOIN orders.orders o ON o.id = i.order_id
        WHERE o.direction = 'purchase' AND i.bullion_id IS NOT NULL
        ORDER BY i.id LIMIT 1`
    )
  )[0];
  assert.ok(bullionItem, "dev needs a bullion line on a purchase order");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

// A PARTIAL EDIT IS SAFE NOW, and that is the change (D214 item 11). The
// statement was `SET quantity = $1, premium = $2` unconditionally, so a
// document naming only one NULLED the other - on a bullion line, how many of
// the coin the customer sent - and the old contract defended it by REQUIRING
// both. buildUpdate names only the keys the document carries, so `quantity`
// alone writes the quantity and leaves the premium exactly where it was.
test("the quantity is written alone, and the premium beside it is untouched", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(admin, async () => {
      const before = await client.query(
        `SELECT premium FROM orders.items WHERE id = $1`, [bullionItem.id]
      );

      const res = await request(app)
        .patch(`/api/orders/items/${bullionItem.id}`)
        .send({ quantity: 7 });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT quantity, premium FROM orders.items WHERE id = $1`,
        [bullionItem.id]
      );
      assert.equal(Number(rows[0].quantity), 7, "the quantity did not change");
      assert.equal(
        rows[0].premium === null ? null : Number(rows[0].premium),
        before.rows[0].premium === null ? null : Number(before.rows[0].premium),
        "the premium beside the quantity was nulled"
      );
    });
  }, { lock: ITEM_LOCKS });
});

// Creating a scrap line is the line, its refiner counterpart and a re-tier of
// every scrap premium on the order, in one transaction. The count assertion is
// what distinguishes "created" from "answered 200".
test("POST :id/items adds a scrap line and its scrap row", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(admin, async () => {
      const before = await client.query(
        `SELECT count(*)::int n FROM orders.items WHERE order_id = $1`,
        [order.id]
      );

      // THE METAL IS AN ID, NOT A NAME (D214 item 11): the body used to send
      // "Gold" and the server resolved it against metals.metals. `content` is
      // not a field either - the rule derives it from the weight, the unit and
      // the purity.
      const { rows: [gold] } = await client.query(
        `SELECT id FROM metals.metals WHERE name = 'Gold'`
      );
      const res = await request(app)
        .post(`/api/orders/${order.id}/items`)
        .send({
          metal_id: gold.id,
          pre_melt: 1.5,
          purity: 0.585,
          unit: "t oz",
        });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const after = await client.query(
        `SELECT count(*)::int n FROM orders.items WHERE order_id = $1`,
        [order.id]
      );
      assert.equal(
        Number(after.rows[0].n),
        Number(before.rows[0].n) + 1,
        "the route answered 200 but added no line"
      );
    });
  }, { lock: ITEM_LOCKS });
});
