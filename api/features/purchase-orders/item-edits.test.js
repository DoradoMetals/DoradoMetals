// The admin edits to the LINES of a purchase order, over real HTTP.
//
// More of the undriven-route list. These are the ones that decide what the
// business believes it received: which lines are confirmed, what a scrap line
// weighs and assays at, and which lines exist at all.
//
// ALL PURE DATABASE WORK. Checked each service function before driving it - no
// email, no FedEx, no Stripe. Two of them open a transaction, and the reasons
// are recorded in the service: a scrap line's weight and its premium feed the
// same number, and deleting a line is two deletes plus a re-tier that must not
// half-happen.
//
// DELETING A LINE IS COVERED HERE AND A BULK PURGE IS NOT. delete_order_items
// removes rows named by id; DELETE /purge_cancelled is
// `DELETE FROM exchange.purchase_orders WHERE status = 'Cancelled'` with no id
// at all. The pin would roll either back, but CLAUDE.md's rule about deleting is
// categorical and a bulk wipe of the live orders table is not something to
// exercise for coverage. See FOLLOWUPS.md.
//
// NOTHING IS COMMITTED. shared/testing/pinned-pool.js holds every query in one
// transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.js";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.js";

await mockSessions();
const { default: app } = await import("#app");

let admin;
let item;
let scrapItem;

before(async () => {
  admin = (
    await outside(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`)
  )[0];
  assert.ok(admin, "dev has no admin user");

  item = (
    await outside(
      `SELECT id, purchase_order_id FROM exchange.purchase_order_items
        WHERE purchase_order_id IS NOT NULL ORDER BY id LIMIT 1`
    )
  )[0];
  assert.ok(item, "dev needs a purchase order item");

  scrapItem = (
    await outside(
      `SELECT i.id, i.purchase_order_id, s.id AS scrap_id
         FROM exchange.purchase_order_items i
         JOIN exchange.scrap s ON s.id = i.scrap_id
        ORDER BY i.id LIMIT 1`
    )
  )[0];
  assert.ok(scrapItem, "dev needs a purchase order item with scrap");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

// save_order_items and reset_order_item are the SAME service call with
// item_status hardcoded true and false, and different body shapes - `ids` for
// one, a single `id` for the other. That asymmetry is the thing worth covering:
// it lives in the controller, where no repo test reaches.
test("save_order_items confirms the named lines", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      await client.query(
        `UPDATE exchange.purchase_order_items SET confirmed = false WHERE id = $1`,
        [item.id]
      );

      const res = await request(app)
        .post("/api/purchase_orders/save_order_items")
        .send({ ids: [item.id], purchase_order_id: item.purchase_order_id });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT confirmed FROM exchange.purchase_order_items WHERE id = $1`,
        [item.id]
      );
      assert.equal(rows[0].confirmed, true, "the line was not confirmed");
    });
  });
});

test("reset_order_item unconfirms the single line it names", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      await client.query(
        `UPDATE exchange.purchase_order_items SET confirmed = true WHERE id = $1`,
        [item.id]
      );

      const res = await request(app)
        .post("/api/purchase_orders/reset_order_item")
        .send({ id: item.id, purchase_order_id: item.purchase_order_id });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT confirmed FROM exchange.purchase_order_items WHERE id = $1`,
        [item.id]
      );
      assert.equal(rows[0].confirmed, false, "the line was not reset");
    });
  });
});

test("get_purchase_order_refiner_metals answers with that order's metals", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .post("/api/purchase_orders/get_purchase_order_refiner_metals")
        .send({ purchase_order_id: item.purchase_order_id });

      assert.equal(res.status, 200, `answered ${res.status}`);
      assert.ok(Array.isArray(res.body), "expected a list of metals");
    });
  });
});

// BOTH HALVES OF THE SCRAP EDIT, because they feed the same number. A scrap
// line is priced content * spot * premium, so a route that wrote the weight and
// not the premium would quote from a mix of old and new - which is why the
// service puts them in one transaction.
test("update_scrap_item writes the scrap AND the line's premium together", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .post("/api/purchase_orders/update_scrap_item")
        .send({
          item: {
            id: scrapItem.id,
            premium: 0.925,
            scrap: {
              id: scrapItem.scrap_id,
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
        `SELECT premium FROM exchange.purchase_order_items WHERE id = $1`,
        [scrapItem.id]
      );
      assert.equal(Number(line.rows[0].premium), 0.925, "the line premium did not change");

      const scrap = await client.query(
        `SELECT pre_melt, purity FROM exchange.scrap WHERE id = $1`,
        [scrapItem.scrap_id]
      );
      assert.equal(Number(scrap.rows[0].pre_melt), 3.5, "the scrap weight did not change");

      // 0.9167 IN, 0.917 OUT, AND THAT IS THE COLUMN NOT THE CODE.
      // exchange.scrap.purity is numeric(4,3), so the fourth decimal is lost on
      // write. My first version of this asserted 0.9167 and failed, which read
      // like the route ignoring purity - it does not, the UPDATE sets it.
      //
      // The rounding is a real defect and a KNOWN one: FOLLOWUPS.md records it,
      // including that production holds two scrap rows at purity exactly 1.000,
      // which is a purity no metal has. Migration 058 widened the DESTINATION
      // (orders.items); the source still rounds. Asserting the rounded value
      // here rather than the sent one, because this test is about the route,
      // and pretending the column does something it does not would make it fail
      // for the wrong reason.
      assert.equal(
        Number(scrap.rows[0].purity),
        0.917,
        "the scrap purity did not change (expected the numeric(4,3) rounding of 0.9167)"
      );
    });
  });
});

// The delete path the service comments describe: the scrap row and the line go
// together, or the order keeps a line pointing at nothing and the assay figures
// exist nowhere.
test("delete_order_items removes the line and its scrap together", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .post("/api/purchase_orders/delete_order_items")
        .send({
          items: [
            {
              id: scrapItem.id,
              purchase_order_id: scrapItem.purchase_order_id,
              scrap: { id: scrapItem.scrap_id },
            },
          ],
        });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const line = await client.query(
        `SELECT 1 FROM exchange.purchase_order_items WHERE id = $1`,
        [scrapItem.id]
      );
      assert.equal(line.rows.length, 0, "the order line survived");

      const scrap = await client.query(`SELECT 1 FROM exchange.scrap WHERE id = $1`, [
        scrapItem.scrap_id,
      ]);
      assert.equal(scrap.rows.length, 0, "the scrap row survived the line being deleted");
    });
  });
});
