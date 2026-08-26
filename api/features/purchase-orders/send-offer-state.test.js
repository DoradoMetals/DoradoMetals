// Sending an offer clears the prices, whatever state the order is in.
//
// reissueOffer NULLs every item price and the order total before writing the
// new offer window - deliberately, because re-offering invalidates the previous
// quote and the code says so. What it does NOT do is ask what state the order
// is in first.
//
// So POST /api/purchase_orders/send_offer on an order that has already been
// ACCEPTED erases the agreed figures: purchase_order_items.price and
// purchase_orders.total_price both become NULL, and there is no way back to
// them - the numbers the business and the customer agreed on are simply gone.
// On a Completed order it erases the record of what was paid.
//
// requireAdmin, so this is not something a customer can do. It is an admin
// clicking the wrong button on the wrong drawer, and CLAUDE.md's first rule is
// about exactly this kind of loss: "A bug is recoverable - deploy a fix. Lost
// customer data is not."
//
// THIS ASSERTS THE CURRENT BEHAVIOUR. Whether send_offer should refuse on an
// accepted or completed order is a business question - see the decision log -
// so it is recorded rather than changed.
//
// Safe to drive: send_offer is pure database work, and inPinnedTransaction
// rolls it back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.js";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.js";

await mockSessions();
const { default: app } = await import("#app");

let admin, accepted, pending;

before(async () => {
  admin = (
    await outside(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`)
  )[0];
  assert.ok(admin, "dev has no admin user");

  // Derived from the rows they are tested against: one order that has been
  // accepted and carries a total, and one that has not.
  accepted = (
    await outside(
      `SELECT id, total_price FROM exchange.purchase_orders
        WHERE offer_status = 'Accepted' AND total_price IS NOT NULL LIMIT 1`
    )
  )[0];
  assert.ok(accepted, "dev has no accepted purchase order with a total - nothing to lose");

  pending = (
    await outside(
      `SELECT id FROM exchange.purchase_orders WHERE offer_status <> 'Accepted' LIMIT 1`
    )
  )[0];
  assert.ok(pending, "dev has no un-accepted purchase order");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

const sendOffer = (orderId) =>
  request(app)
    .post("/api/purchase_orders/send_offer")
    .send({ order: { id: orderId, spots_locked: false }, user_name: "test-admin" });

test("sending an offer on an accepted order erases the agreed total and line prices", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      const before = await client.query(
        `SELECT total_price FROM exchange.purchase_orders WHERE id = $1`,
        [accepted.id]
      );
      assert.ok(before.rows[0].total_price !== null, "the fixture order had no total to lose");

      const res = await sendOffer(accepted.id);
      assert.equal(res.status, 200, `send_offer answered ${res.status}`);

      // The rows, not the response.
      const after = await client.query(
        `SELECT total_price, offer_status FROM exchange.purchase_orders WHERE id = $1`,
        [accepted.id]
      );
      assert.equal(after.rows[0].total_price, null, "the agreed total survived");
      assert.equal(after.rows[0].offer_status, "Sent");

      const items = await client.query(
        `SELECT count(*)::int AS n FROM exchange.purchase_order_items
          WHERE purchase_order_id = $1 AND price IS NOT NULL`,
        [accepted.id]
      );
      assert.equal(items.rows[0].n, 0, "some line prices survived");
    });
  });
});

// The other direction, so the suite is not only describing the hazard. This is
// the transition the route exists for, and it must keep working if the one
// above is ever guarded.
test("sending an offer on an un-accepted order opens the offer window", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await sendOffer(pending.id);
      assert.equal(res.status, 200, `send_offer answered ${res.status}`);

      const { rows } = await client.query(
        `SELECT offer_status, offer_sent_at, offer_expires_at
           FROM exchange.purchase_orders WHERE id = $1`,
        [pending.id]
      );
      assert.equal(rows[0].offer_status, "Sent");
      assert.ok(rows[0].offer_sent_at, "no offer_sent_at was written");
      assert.ok(rows[0].offer_expires_at, "no offer_expires_at was written");
      assert.ok(
        new Date(rows[0].offer_expires_at) > new Date(rows[0].offer_sent_at),
        "the offer expires before it was sent"
      );
    });
  });
});
