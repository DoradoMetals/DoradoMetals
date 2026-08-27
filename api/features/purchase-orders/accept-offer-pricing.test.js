// What the business records that it owes, when the customer accepts the offer.
//
// FOLLOWUPS records the spot-manipulation finding on the SELL side - `spots`
// arriving in the request body and pricing a sales order, reaching
// get_sales_tax, createSalesOrder and updatePaymentIntent, where it became the
// Stripe charge. Those were fixed by taking the server's spots.
//
// THE BUY SIDE IS NOT IN THAT LIST, and it is the same shape pointing the other
// way. On the sell side a manipulated number makes the customer PAY LESS. Here
// it makes the business PAY MORE.
//
// accept_offer takes the whole order out of req.body. calculateTotalPrice reads
// `item.price ?? (content * bid_spot * premium)`, so a price in the body is used
// VERBATIM - no spot lookup even happens - and `shipping_charge` and
// `payout.cost` are SUBTRACTED from the total, so sending zero for both
// maximises it. calculateItemPrice does the same, and updateOrderItemPrices
// writes its result into exchange.purchase_order_items.price. The total lands in
// purchase_orders.total_price via moveOrderToAccepted.
//
// The route is requireUser + requireOwnOrder, so this is a customer accepting
// THEIR OWN offer - which is exactly who benefits from naming the number.
//
// THIS TEST MEASURES IT RATHER THAN ARGUING IT. Two requests, identical except
// for the prices in the body, and the recorded total follows the body both
// times. It is safe to run: accept_offer is pure database work - no FedEx, no
// Stripe, no email - and inPinnedTransaction rolls the whole thing back.
//
// It asserts the CURRENT behaviour. Fixing it is a wire-shape question and
// Jacob's call, for the same reason the sell-side one was: see FOLLOWUPS.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

let order, owner, items;

before(async () => {
  const rows = await outside(
    `SELECT po.id, po.user_id
       FROM exchange.purchase_orders po
      WHERE po.user_id IS NOT NULL
        AND (SELECT count(*) FROM exchange.purchase_order_items i
              WHERE i.purchase_order_id = po.id) > 0
      ORDER BY po.created_at DESC
      LIMIT 1`
  );
  assert.ok(rows[0], "dev has no purchase order with items");
  order = rows[0];

  const users = await outside(
    `SELECT id, name, email FROM exchange.users WHERE id = $1`,
    [order.user_id]
  );
  owner = users[0];
  assert.ok(owner, "the order's owner is missing from exchange.users");

  items = await outside(
    `SELECT id, quantity FROM exchange.purchase_order_items WHERE purchase_order_id = $1`,
    [order.id]
  );
  assert.ok(items.length > 0, "the fixture order has no items");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

// Everything acceptOffer reads off `order`, built from the row it is tested
// against so the fixture cannot drift: id, spots_locked, order_items, and the
// two figures that are subtracted.
const bodyClaiming = (pricePerItem) => ({
  purchase_order: {
    id: order.id,
    spots_locked: true,
    order_items: items.map((i) => ({
      id: i.id,
      item_type: "scrap",
      price: pricePerItem,
      quantity: Number(i.quantity) || 1,
      scrap: { metal: "Gold", content: 0, bid_premium: 0 },
    })),
    shipment: { shipping_charge: 0 },
    payout: { cost: 0 },
  },
  order_spots: [],
  spot_prices: [],
});

const acceptClaiming = async (pricePerItem, client) => {
  const res = await request(app)
    .post("/api/purchase_orders/accept_order")
    .send(bodyClaiming(pricePerItem));
  assert.equal(res.status, 200, `accept_order answered ${res.status}`);

  // The ROW, not the response. A 200 is not evidence of what was written.
  const { rows } = await client.query(
    `SELECT total_price FROM exchange.purchase_orders WHERE id = $1`,
    [order.id]
  );
  return Number(rows[0].total_price);
};

test("the price in the request body becomes what the business records it owes", async () => {
  await inPinnedTransaction(async (client) => {
    // Admin, because 086 made acceptance admin-only - customers do not control
    // order status. The pricing-from-body behaviour this file pins is now an
    // ADMIN capability, which is why it is pinned rather than fixed.
    await as({ ...owner, role: "admin" }, async () => {
      const modest = await acceptClaiming(1, client);
      const greedy = await acceptClaiming(100000, client);

      // A SCRAP LINE IS NOT MULTIPLIED BY ITS QUANTITY. calculateTotalPrice
      // multiplies only the product branch; scrap contributes `price` once.
      // The first version of this test asserted quantity * price and failed
      // against a fixture whose single line has quantity 15 - the test was
      // wrong, not the code, and the claim it exists to make was unaffected.
      const lines = items.length;

      assert.equal(modest, lines * 1, "the body's price was not used verbatim");
      assert.equal(greedy, lines * 100000, "the body's price was not used verbatim");
      assert.ok(
        greedy > modest,
        "the recorded total did not follow the number in the request"
      );
    });
  });
});

test("the line prices in the database follow the body too", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...owner, role: "admin" }, async () => {
      await acceptClaiming(4242, client);

      const { rows } = await client.query(
        `SELECT DISTINCT price FROM exchange.purchase_order_items WHERE purchase_order_id = $1`,
        [order.id]
      );
      assert.deepEqual(
        rows.map((r) => Number(r.price)),
        [4242],
        "the body's price was not written to the item rows"
      );
    });
  });
});
