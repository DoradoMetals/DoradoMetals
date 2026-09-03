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
import test, { after, before } from "node:test";
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

before(async () => {
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

after(async () => {
  restoreSessions();
  await pool.end();
});

// confirmed and reset are the SAME service call with item_status hardcoded
// true and false. That asymmetry is the thing worth covering: it lives in the
// dispatch, where no repo test reaches.
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

test("reset: true unconfirms the line", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(admin, async () => {
      await client.query(
        `UPDATE orders.items SET confirmed = true WHERE id = $1`,
        [item.id]
      );

      const res = await request(app)
        .patch(`/api/orders/items/${item.id}`)
        .send({ reset: true });

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

// BOTH HALVES OF THE SCRAP EDIT, because they feed the same number. A scrap
// line is priced content * spot * premium, so a route that wrote the weight and
// not the premium would quote from a mix of old and new - which is why the
// service puts them in one transaction.
test("the scrap field writes the scrap AND the line's premium together", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(admin, async () => {
      const res = await request(app)
        .patch(`/api/orders/items/${scrapItem.id}`)
        .send({
          scrap: {
            premium: 0.925,
            scrap: {
              id: scrapItem.id,
              pre_melt: 3.5,
              post_melt: 3.25,
              purity: 0.9167,
              gross_unit: "t oz",
              content: 2.979,
            },
          },
        });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const line = await client.query(
        `SELECT premium, pre_melt, purity FROM orders.items WHERE id = $1`,
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
