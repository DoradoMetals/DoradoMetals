// The admin edits to the LINES of a purchase order, over real HTTP.
//
// More of the undriven-route list. These are the ones that decide what the
// business believes it received: which lines are confirmed, what a scrap line
// weighs and assays at, and which lines exist at all.
//
// THE SURFACE IS THE LINE'S OWN ENDPOINT NOW - PATCH and DELETE
// /api/orders/items/:id, under the unified namespace (a line is a resource;
// orders.items is direction-unified). Each field dispatches to the same
// service function the old POST route called; the confirmed/reset pair still
// hardcodes item_status true and false in the dispatch, and the line's order
// and scrap linkage are resolved SERVER-side rather than taken from the body.
//
// ALL PURE DATABASE WORK. Checked each service function before driving it - no
// email, no FedEx, no Stripe. Two of them open a transaction, and the reasons
// are recorded in the service: a scrap line's weight and its premium feed the
// same number, and deleting a line is two deletes plus a re-tier that must not
// half-happen.
//
// DELETING A LINE IS COVERED HERE AND A BULK PURGE IS NOT. The line DELETE
// removes the row the path names; DELETE /purge_cancelled is
// `DELETE FROM exchange.purchase_orders WHERE status = 'Cancelled'` with no id
// at all. The pin would roll either back, but CLAUDE.md's rule about deleting is
// categorical and a bulk wipe of the live orders table is not something to
// exercise for coverage. See FOLLOWUPS.md.
//
// NOTHING IS COMMITTED. shared/testing/pinned-pool.js holds every query in one
// transaction that is rolled back.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, asAdmin } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS. These are SELECT
// projections, not table rows - naming a row type would claim columns the
// query never asked for.
type UserFixture = { id: string; name: string | null; email: string | null };
type ItemFixture = { id: string; purchase_order_id: string };
type ScrapItemFixture = ItemFixture;

let admin: UserFixture;
let item: ItemFixture;
let scrapItem: ScrapItemFixture;

beforeAll(async () => {
  admin = (
    await outside<UserFixture>(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`)
  )[0];
  assert.ok(admin, "dev has no admin user");

  item = (
    await outside<ItemFixture>(
      `SELECT i.id, i.order_id AS purchase_order_id
         FROM orders.items i
         JOIN orders.orders o ON o.id = i.order_id
        WHERE o.direction = 'purchase' ORDER BY i.id LIMIT 1`
    )
  )[0];
  assert.ok(item, "dev needs a purchase order item");

  // A scrap line IS a line with no bullion (the one-table model).
  scrapItem = (
    await outside<ScrapItemFixture>(
      `SELECT i.id, i.order_id AS purchase_order_id
         FROM orders.items i
         JOIN orders.orders o ON o.id = i.order_id
        WHERE o.direction = 'purchase' AND i.bullion_id IS NULL
        ORDER BY i.id LIMIT 1`
    )
  )[0];
  assert.ok(scrapItem, "dev needs a purchase order scrap line");
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

// `confirmed` IS A COLUMN, and both directions are the same write (D214 item
// 11). It was a `true`-only literal with a second name, `reset: true`, for the
// other direction - because the dispatch was
// `body.confirmed === true || body.reset === true`, so `confirmed: false`
// matched no branch and answered 200 having done nothing.
test("confirmed: true confirms the line", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(admin, async () => {
      await client.query(
        `UPDATE orders.items SET confirmed = false WHERE id = $1`,
        [item.id]
      );

      const res = await request(app)
        .patch(`/api/orders/items/${item.id}`)
        .send({ confirmed: true });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT confirmed FROM orders.items WHERE id = $1`,
        [item.id]
      );
      assert.equal(rows[0].confirmed, true, "the line was not confirmed");
    });
  });
});

test("confirmed: false unconfirms the line", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(admin, async () => {
      await client.query(
        `UPDATE orders.items SET confirmed = true WHERE id = $1`,
        [item.id]
      );

      const res = await request(app)
        .patch(`/api/orders/items/${item.id}`)
        .send({ confirmed: false });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT confirmed FROM orders.items WHERE id = $1`,
        [item.id]
      );
      assert.equal(rows[0].confirmed, false, "the line was not reset");
    });
  });
});

test("the refiner spots read answers by customer-order id", async () => {
  await inPinnedTransaction(async () => {
    await asAdmin(admin, async () => {
      // GET /orders/:orderId/refiners/spots replaced the legacy route in the
      // read-flip wave - same key the components hold, the engagement
      // resolved server-side, the path under the parent per the route
      // convention.
      const res = await request(app)
        .get(`/api/orders/${item.purchase_order_id}/refiners/spots`);

      assert.equal(res.status, 200, `answered ${res.status}`);
      assert.ok(Array.isArray(res.body), "expected a list of metals");

      // And the bare engagement row is where a PATCH gets its key.
      const eng = await request(app)
        .get(`/api/orders/${item.purchase_order_id}/refiners`);
      assert.equal(eng.status, 200, `the engagement read answered ${eng.status}`);
      assert.ok(eng.body.id, "the engagement row carries no id to PATCH by");
      assert.equal(eng.body.order_id, item.purchase_order_id);
    });
  });
});

// ONE ROW, ONE FLAT PATCH (D214 item 11). The body was
// `{scrap: {premium, scrap: {...}}}` - the drawer's document for ONE table -
// and it is the line's own columns now. `content` is NOT among them: it is
// derived from the weight, the unit and the purity, because two definitions of
// what content means is the defect that costs money.
test("the line's own columns are the body, and content is derived from them", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(admin, async () => {
      const res = await request(app)
        .patch(`/api/orders/items/${scrapItem.id}`)
        .send({
          premium: 0.925,
          pre_melt: 3.5,
          post_melt: 3.25,
          purity: 0.9167,
          unit: "t oz",
        });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const line = await client.query(
        `SELECT premium, pre_melt, purity, content FROM orders.items WHERE id = $1`,
        [scrapItem.id]
      );
      assert.equal(Number(line.rows[0].premium), 0.925, "the line premium did not change");
      assert.equal(Number(line.rows[0].pre_melt), 3.5, "the scrap weight did not change");

      // 0.9167 IN, 0.9167 OUT: orders.items.purity is unconstrained (058), so
      // the fourth decimal survives - the rounding defect the old
      // numeric(4,3) scrap column had, pinned here so it stays fixed.
      assert.equal(
        Number(line.rows[0].purity),
        0.9167,
        "the scrap purity was rounded - orders.items.purity has narrowed"
      );

      // The post-melt weight at that purity, computed by the rule and by
      // nothing the request said.
      assert.ok(
        Math.abs(Number(line.rows[0].content) - 3.25 * 0.9167) < 1e-6,
        `content is ${line.rows[0].content}, not the derived 3.25 x 0.9167`
      );
    });
  });
});

// THE REFINER'S ASSAY NUMBERS ARE NOT IN THIS BODY ANY MORE. They are
// refiners.items - their own table, their own route - and a line edit that
// carried them let a customer's DECLARED weight and a refinery's REPORT be
// written by one document.
test("the assay columns are refused on the line's own patch", async () => {
  await inPinnedTransaction(async () => {
    await asAdmin(admin, async () => {
      const res = await request(app)
        .patch(`/api/orders/items/${scrapItem.id}`)
        .send({ purity_actual: 0.5, post_melt_actual: 3 });
      assert.equal(res.status, 400, `answered ${res.status}`);
      assert.match(res.body?.error?.message ?? "", /purity_actual/);
    });
  });
});

// The delete path the service comments describe: the scrap row and the line go
// together, or the order keeps a line pointing at nothing and the assay figures
// exist nowhere.
test("DELETE removes the line and its scrap together", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(admin, async () => {
      // No body at all: the scrap linkage is the ROW's, resolved server-side,
      // so the request cannot name a different scrap row to delete.
      const res = await request(app).delete(`/api/orders/items/${scrapItem.id}`);

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const line = await client.query(
        `SELECT 1 FROM orders.items WHERE id = $1`,
        [scrapItem.id]
      );
      assert.equal(line.rows.length, 0, "the order line survived");

      const refiner = await client.query(
        `SELECT 1 FROM refiners.items WHERE order_item_id = $1`, [scrapItem.id]
      );
      assert.equal(refiner.rows.length, 0, "the refiner counterpart survived the cascade");
    });
  });
});
