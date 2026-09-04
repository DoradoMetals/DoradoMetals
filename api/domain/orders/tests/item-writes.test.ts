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
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, asAdmin } from "#shared/testing/session.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { aUser, anOrder, aProduct } from "#shared/testing/builders/index.ts";

// Both tests write orders.items (and its refiners.items counterpart) - the
// scrap IS the line since D212. The lock declaration has to cover the tables
// the test writes TODAY: without ORDERS this file passed alone and 500'd in
// the full run, colliding with the order-placing files.
const ITEM_LOCKS = [LOCKS.SCRAP_SWEEP, LOCKS.ORDERS];

await mockSessions();
const { default: app } = await import("#app");

// THE FIXTURES ARE BUILT INSIDE THE TRANSACTION (lane 1). They used to be
// resolved in `beforeAll` through `outside()` - the first admin in
// exchange.users, the first purchase order with a user, the first bullion line
// on one - which meant every edit below was made to a real customer's real
// order, recoverable only because the pin rolls it back. Building them here
// costs three inserts and makes each test's subject exactly what it says.
//
// The admin is shared/testing/actor.ts's TEST_ACTOR: the session is mocked, so
// the ROLE comes from `asAdmin`, but the id must be a real auth.users row for
// the audit trigger to stamp the edits - and TEST_ACTOR is the one person the
// preflight commits for exactly that.
const admin = TEST_ACTOR;

const aPurchaseOrderWithABullionLine = async (c: PoolClient) => {
  const customer = await aUser(c);
  const product = await aProduct(c);
  const order = await anOrder(c, customer, { direction: "purchase" })
    .withBullion(product, 2, { premium: 12.5 })
    .withSpots();
  return { customer, order, bullionItem: { id: order.items[0]!.id } };
};

afterAll(async () => {
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
    const { bullionItem } = await aPurchaseOrderWithABullionLine(client);
    await asAdmin(admin, async () => {
      // A WARM-UP EDIT FIRST, and it is not ceremony. A quantity change
      // RE-TIERS the order (rules.retiersAfterEdit), so the premium is
      // re-resolved from rates.rates against the order's total content - and
      // a different quantity is a different total, so it may legitimately
      // land on a different BAND. The claim being made is not "the number
      // does not move": it is that a document naming only `quantity` must not
      // NULL the premium beside it, which is what the old unconditional
      // `SET quantity = $1, premium = $2` did.
      await request(app).patch(`/api/orders/items/${bullionItem.id}`).send({ quantity: 2 });

      const before = await client.query(
        `SELECT premium FROM orders.items WHERE id = $1`, [bullionItem.id]
      );
      assert.notEqual(before.rows[0].premium, null, "the fixture line has no premium to lose");

      const res = await request(app)
        .patch(`/api/orders/items/${bullionItem.id}`)
        .send({ quantity: 7 });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT quantity, premium FROM orders.items WHERE id = $1`,
        [bullionItem.id]
      );
      assert.equal(Number(rows[0].quantity), 7, "the quantity did not change");
      assert.notEqual(rows[0].premium, null, "the premium beside the quantity was nulled");
    });
  }, { actor: TEST_ACTOR.id, lock: ITEM_LOCKS });
});

// Creating a scrap line is the line, its refiner counterpart and a re-tier of
// every scrap premium on the order, in one transaction. The count assertion is
// what distinguishes "created" from "answered 200".
test("POST :id/items adds a scrap line and its scrap row", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { order } = await aPurchaseOrderWithABullionLine(client);
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
  }, { actor: TEST_ACTOR.id, lock: ITEM_LOCKS });
});
