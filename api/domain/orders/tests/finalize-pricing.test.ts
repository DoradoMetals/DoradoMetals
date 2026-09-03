// What the business records that it owes, when an order is accepted.
//
// THIS FILE USED TO PIN THE BUG IT NOW REFUSES. accept_order took the whole
// order out of req.body, calculateTotalPrice read `item.price` verbatim, and
// the two tests here MEASURED that: two requests identical except for the
// prices in the body, and the recorded total followed the body both times -
// $1 per line or $100,000 per line, whichever the request claimed. The header
// said fixing it was a wire-shape question and Jacob's call.
//
// The call came in stages on 28 August: the PATCH consolidation put accepting
// behind one endpoint; the pure-label ruling then split the pricing OUT of
// the status entirely - `finalize_pricing: true` on PATCH /api/orders/:id
// prices the order and touches no label ('Accepted' itself left the
// lifecycle, migration 092). The pricing inputs are resolved SERVER-side -
// the order from the database, its frozen spots from order_metals, the live
// spots from exchange.metals. The body's arrays are not merely ignored, they
// are refused by name: `purchase_order`, `order_spots` and `spot_prices` are
// not fields of the document, and a silently-dropped field is the
// admin-mutation-urls bug wearing a new route.
//
// So the two claims worth measuring are now:
//   a poisoned document is refused, and the order's money does not move
//   a clean accept records a total derived from the database's own rows
//
// The second is asserted as a property rather than a number: total_price must
// equal calculateTotalPrice over the order AS THE API NOW SERVES IT and the
// spot rows AS THE DATABASE NOW HOLDS THEM - every input a row, none of them
// the request's. The fixture can drift and the property holds.
//
// NOTHING IS COMMITTED - the pool is pinned to a rolled-back transaction.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { calculateTotalPrice } from "#domain/pricing/service.ts";
import * as purchaseOrderService from "#domain/orders/service.ts";
import { LOCKS } from "#shared/testing/locks.ts";

const ORDER_LOCK = LOCKS.ORDERS;

await mockSessions();
const { default: app } = await import("#app");

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS. These are SELECT
// projections, not table rows - naming a row type would claim columns the
// query never asked for.
type UserFixture = { id: string; name: string | null; email: string | null };
type OrderFixture = { id: string; user_id: string; total_price: string | null };
type ItemFixture = { id: string; quantity: string | number | null };

let order: OrderFixture;
let admin: UserFixture;
let items: ItemFixture[];

before(async () => {
  const rows = await outside<OrderFixture>(
    `SELECT o.id, o.user_id, t.total AS total_price
       FROM orders.orders o
       JOIN orders.transactions t ON t.order_id = o.id
      WHERE o.direction = 'purchase' AND o.user_id IS NOT NULL
        AND t.payout_fee IS NOT NULL
        AND (SELECT count(*) FROM orders.items i WHERE i.order_id = o.id) > 0
        AND EXISTS (SELECT 1 FROM orders.spots s WHERE s.order_id = o.id)
      ORDER BY o.created_at DESC
      LIMIT 1`
  );
  assert.ok(rows[0], "dev has no purchase order with items, spots and a payout");
  order = rows[0];

  admin = (
    await outside<UserFixture>(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`)
  )[0];
  assert.ok(admin, "dev has no admin user");

  items = await outside<ItemFixture>(
    `SELECT id, quantity FROM orders.items WHERE order_id = $1`,
    [order.id]
  );
  assert.ok(items.length > 0, "the fixture order has no items");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

// The exact attack the old tests demonstrated worked: the caller names the
// price. Every vector it used - the order with its priced items, the spot
// arrays, the zeroed charges - is an unknown field of the document now.
const poisonedClaiming = (pricePerItem: number) => ({
  finalize_pricing: true,
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

test("a document claiming its own prices is refused by name, and the money does not move", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await as({ ...admin, role: "admin" }, async () => {
      for (const claimed of [1, 100000]) {
        const res = await request(app)
          .patch(`/api/orders/${order.id}`)
          .send(poisonedClaiming(claimed));

        assert.equal(res.status, 400, `the poisoned document was answered ${res.status}`);
        assert.match(
          res.body?.error?.message ?? "",
          /"purchase_order"/,
          "the refusal does not name the field it refused"
        );
      }

      // Refused means REFUSED: no op ran, so the stored total is exactly what
      // dev held before either request.
      const { rows } = await client.query(
        `SELECT total AS total_price FROM orders.transactions WHERE order_id = $1`,
        [order.id]
      );
      assert.equal(
        rows[0].total_price === null ? null : Number(rows[0].total_price),
        order.total_price === null ? null : Number(order.total_price),
        "a refused document still moved the order's total"
      );
    });
  }, { lock: ORDER_LOCK });
});

test("a clean finalize prices the order from the database's own rows", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await as({ ...admin, role: "admin" }, async () => {
      const before = (
        await client.query(
          `SELECT status FROM orders.orders WHERE id = $1`,
          [order.id]
        )
      ).rows[0];

      const res = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ finalize_pricing: true });
      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const row = (
        await client.query(
          `SELECT t.total AS total_price, o.status, o.spots_locked
             FROM orders.orders o
             JOIN orders.transactions t ON t.order_id = o.id
            WHERE o.id = $1`,
          [order.id]
        )
      ).rows[0];
      // THE PURE-LABEL RULING, asserted: pricing moved money and the pin,
      // and did NOT touch the status.
      assert.equal(
        row.status,
        before.status,
        "finalize_pricing moved the status - pipelines must not write labels"
      );
      assert.equal(row.spots_locked, true, "finalizing pins the spots");

      // The property: the stored total is calculateTotalPrice over what the
      // API now SERVES (the PATCH answers with the re-read order, lines
      // priced) and the spot rows the database now HOLDS. Every input is a
      // row; the request contributed nothing but the operation's name.
      const spots = (
        await client.query(
          `SELECT m.name, sp.ask, sp.bid
             FROM orders.spots sp JOIN metals.metals m ON m.id = sp.metal_id
            WHERE sp.order_id = $1`,
          [order.id]
        )
      ).rows;
      // THE PATCH ANSWERS WITH THE SLIM ORDER NOW (wave 3), so the priced
      // lines it used to carry come from the API's own composed read - which
      // is what calculateTotalPrice takes, and what finalizePricing itself
      // priced from. The property is unchanged: every input is a row, and the
      // request contributed nothing but the operation's name.
      const priced = await purchaseOrderService.getPurchaseById(order.id);
      // GUARDED. getPurchaseById returns `| undefined`, and this line handed
      // it straight to calculateTotalPrice: an unreadable order produced a
      // TypeError inside the pricing module instead of naming the missing
      // read, i.e. the test failed in the wrong place. Surfaced by the
      // TypeScript conversion.
      assert.ok(priced, `the API could not read order ${order.id} back after pricing it`);

      // AND THE PAYOUT IS ESTABLISHED RATHER THAN ASSUMED. calculateTotalPrice
      // subtracts `order.payout.cost`; the composed read declares
      // `payout: Record<string, any>`, so nothing guarantees the key is there,
      // and an absent one makes the whole total NaN rather than throwing. The
      // production caller only ASSERTS the shape - service.ts's `OrderLike`
      // intersects `payout: { cost: number }` onto a row that does not
      // promise it. Here it is checked. Surfaced by the TypeScript conversion.
      const { payout } = priced;
      assert.equal(
        typeof payout?.cost,
        "number",
        "the composed order carries no numeric payout.cost - the total would be NaN"
      );
      const expected = calculateTotalPrice({ ...priced, payout: { cost: payout.cost } }, spots);

      assert.equal(
        Number(row.total_price).toFixed(2),
        expected.toFixed(2),
        "the stored total does not derive from the database's own rows"
      );
    });
  }, { lock: ORDER_LOCK });
});
