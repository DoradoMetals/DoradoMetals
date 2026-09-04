// POST /quotes/order — prices an EXISTING purchase order, the drawer estimate the frontend used to compute client-side. Pins: ownership (owner/admin get an answer, a stranger 403, anonymous 401); stored-vs-estimate (a frozen item.price returns verbatim as 'stored', an unpriced line is estimated from the same tables, hand-computed here); locked spots (a pinned orders.spots.bid prices the estimate, a null one falls back to the live spot — the same choice orderQuote's bidFor makes); and the $26.81 pin (a body riding spots/prices/an order object in changes nothing).
//
// THE FIXTURE IS BUILT, not discovered (exchange-fixtures lane, D214 item 10).
// It used to be "the oldest owned purchase order with items", read out of
// exchange.purchase_orders / exchange.purchase_order_items / exchange.scrap /
// exchange.products / exchange.metals / exchange.payouts / exchange.shipments
// — every one of those frozen since the Great Purge (D212), while orderQuote
// reads orders.orders, orders.items, orders.spots, payments.details (via
// db/payouts/repo.ts) and shipping.shipments (via the shipments order-read).
// The live spot feed (spots.spots/metals.metals) is still read here, but
// NON-DESTRUCTIVELY and by name — a reference row, the same way
// domain/quotes/tests/replay.test.ts reads it, not a fixture discovery.
//
// Everything runs inside the pin; the locked-spots test WRITES (a bid pinned,
// then cleared) and the rollback discards it.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { aUser, aProduct, anOrder, aPayout, aShipment } from "#shared/testing/builders/index.ts";

await mockSessions();
const { default: app } = await import("#app");

// This file writes order rows (inside the pin), so it takes the same lock the
// other order suites take.
const ORDER_LOCK = LOCKS.ORDERS;

// The quote line shape these assertions read. The response is `any` through
// supertest, so naming it is what lets the compiler check the reads.
type QuoteLine = {
  id: string;
  kind: string;
  unit_price: number;
  line_total: number;
  source: string;
};

const EXACT = 1e-9; // same floats, same tables, same order of operations

type SpotFixture = { id: string; name: string; bid: number };

// The live Gold spot — read once, never written by this file. Every estimate
// below hand-checks against this value, the same row getSpotPrices reads.
let gold: SpotFixture;

beforeAll(async () => {
  const spots = await outside<SpotFixture>(
    `SELECT m.id, m.name, s.bid FROM spots.spots s JOIN metals.metals m ON m.id = s.metal_id`
  );
  const found = spots.find((s) => s.name === "Gold");
  assert.ok(found?.bid, "dev's Gold spot is not priced - every estimate check here would be vacuous");
  gold = found;
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

// One scrap line and one bullion line, each with a STORED price and each with
// an ESTIMATE (price null) - four lines, and `expected` carries the same
// formula orderQuote uses so the test hand-checks rather than repeats itself.
async function aQuotableOrder(c: PoolClient) {
  const owner = await aUser(c);
  const product = await aProduct(c, { metal: "Gold", content: 1 });

  const specs = [
    { bullion_id: null as string | null, metal_id: gold.id, content: 2, premium: 1, quantity: 1, price: 1500 as number | null },
    { bullion_id: null as string | null, metal_id: gold.id, content: 0.5, premium: 0.9, quantity: 1, price: null as number | null },
    { bullion_id: product.id, metal_id: product.metal_id, content: product.content, premium: 40, quantity: 1, price: 1999 as number | null },
    { bullion_id: product.id, metal_id: product.metal_id, content: product.content, premium: 45, quantity: 2, price: null as number | null },
  ];

  const order = await anOrder(c, owner, { direction: "purchase", status: "Pending" })
    .withLines(...specs.map((s) => ({
      bullion_id: s.bullion_id, metal_id: s.metal_id, content: s.content,
      premium: s.premium, quantity: s.quantity, price: s.price,
    })))
    // Not yet locked (every bid null) - estimates below price at the LIVE
    // spot, matching bidFor's fallback.
    .withSpots({ bid: null })
    .withTotals({ total: 1 });

  await aPayout(c, owner, { order, payout_fee: 12.5 });
  await aShipment(c, order, { cost: 24.5 });

  const expected = specs.map((s, i) => {
    const kind = s.bullion_id === null ? "scrap" : "product";
    const stored = s.price != null;
    const unit_price = stored ? s.price! : s.content * (gold.bid * s.premium);
    const line_total = kind === "product" ? unit_price * s.quantity : unit_price;
    return { id: order.items[i]!.id, kind, source: stored ? "stored" : "estimate", unit_price, line_total };
  });

  return {
    order, owner: { ...owner, role: "user" as const }, expected,
    payoutCost: 12.5, shippingCharge: 24.5,
  };
}

// ---------------------------------------------------------------- ownership

test("the order quote is the owner's and the admins', and nobody else's", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const owner = await aUser(c);
    const stranger = await aUser(c);
    const order = await anOrder(c, owner, { direction: "purchase", status: "Pending" })
      .withLines({ metal_id: gold.id, content: 1, premium: 1, price: 100 });

    await anonymous(async () => {
      const res = await request(app).post("/api/quotes/order").send({ order_id: order.id });
      assert.equal(res.status, 401, `answered ${res.status} with no session`);
    });

    await as({ ...stranger, role: "user" }, async () => {
      const res = await request(app).post("/api/quotes/order").send({ order_id: order.id });
      assert.equal(res.status, 403, `answered ${res.status} with somebody else's estimate`);
    });

    await as({ ...owner, role: "user" }, async () => {
      const res = await request(app).post("/api/quotes/order").send({ order_id: order.id });
      assert.equal(res.status, 200, `the owner was answered ${res.status}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.order_id, order.id);

      // A body naming no order is refused by the guard, not waved through.
      const unnamed = await request(app).post("/api/quotes/order").send({});
      assert.equal(unnamed.status, 400, `an unnamed order answered ${unnamed.status}`);
    });

    // The stranger's own row, re-badged: admins administer every order.
    await as({ ...stranger, role: "admin" }, async () => {
      const res = await request(app).post("/api/quotes/order").send({ order_id: order.id });
      assert.equal(res.status, 200, `an admin was answered ${res.status}: ${JSON.stringify(res.body)}`);
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

// ---------------------------------------------------- stored versus estimate

test("stored prices come back verbatim and estimates come from the tables", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { order, owner, expected, payoutCost, shippingCharge } = await aQuotableOrder(c);

    await as(owner, async () => {
      const res = await request(app).post("/api/quotes/order").send({ order_id: order.id });
      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);
      assert.equal(
        res.body.items.length, expected.length,
        "the quote does not carry one line per typed item"
      );

      let scrapTotal = 0;
      let bullionTotal = 0;
      for (const exp of expected) {
        const line = res.body.items.find((l: QuoteLine) => l.id === exp.id);
        assert.ok(line, `item ${exp.id} is missing from the quote`);
        assert.equal(line.kind, exp.kind);
        assert.equal(line.source, exp.source, `item ${exp.id} (${exp.kind}) not flagged ${exp.source}`);
        assert.ok(Math.abs(line.unit_price - exp.unit_price) < EXACT,
          `unit_price ${line.unit_price} != hand-computed ${exp.unit_price} for ${exp.kind} ${exp.id}`);
        assert.ok(Math.abs(line.line_total - exp.line_total) < EXACT,
          `line_total ${line.line_total} != ${exp.line_total} for ${exp.kind} ${exp.id}`);

        if (exp.kind === "product") bullionTotal += line.line_total;
        else scrapTotal += line.line_total;
      }

      assert.ok(Math.abs(res.body.scrap_total - scrapTotal) < EXACT, "scrap_total is not the sum of its lines");
      assert.ok(Math.abs(res.body.bullion_total - bullionTotal) < EXACT, "bullion_total is not the sum of its lines");
      // purchaseOrderTotal's bottom line: items minus shipping minus payout.
      assert.ok(
        Math.abs(res.body.total - (scrapTotal + bullionTotal - shippingCharge - payoutCost)) < EXACT,
        `total ${res.body.total} != items ${scrapTotal + bullionTotal} - shipping ${shippingCharge} - payout ${payoutCost}`
      );
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

// ------------------------------------------------------------- locked spots

test("a locked order estimates at its locked spots, an unlocked one at live", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const owner = await aUser(c);
    const order = await anOrder(c, owner, { direction: "purchase", status: "Pending" })
      .withLines({ metal_id: gold.id, content: 3, premium: 1, price: null })
      .withSpots({ bid: null });
    const target = order.items[0]!;

    await as({ ...owner, role: "user" }, async () => {
      // Pin the metal's own spot row - the same write PUT /orders/:id/spots
      // makes when an admin locks an order - and price again.
      await c.query(
        `UPDATE orders.spots SET bid = $1 WHERE order_id = $2 AND metal_id = $3`,
        [1234.56, order.id, gold.id]
      );

      const locked = await request(app).post("/api/quotes/order").send({ order_id: order.id });
      assert.equal(locked.status, 200, `answered ${locked.status}: ${JSON.stringify(locked.body)}`);
      const lockedLine = locked.body.items.find((l: QuoteLine) => l.id === target.id);
      assert.ok(lockedLine, `item ${target.id} is missing from the locked quote`);
      assert.equal(lockedLine.source, "estimate");
      const atPin = 3 * (1234.56 * 1);
      assert.ok(Math.abs(lockedLine.unit_price - atPin) < EXACT,
        `locked estimate ${lockedLine.unit_price} != ${atPin} at the pinned spot`);

      // Unlock the way unlockSpots does - the frozen bid cleared - and the
      // same line prices at the live spot.
      await c.query(
        `UPDATE orders.spots SET bid = NULL WHERE order_id = $1 AND metal_id = $2`,
        [order.id, gold.id]
      );

      const unlocked = await request(app).post("/api/quotes/order").send({ order_id: order.id });
      assert.equal(unlocked.status, 200);
      const unlockedLine = unlocked.body.items.find((l: QuoteLine) => l.id === target.id);
      assert.ok(unlockedLine, `item ${target.id} is missing from the unlocked quote`);
      const atLive = 3 * (gold.bid * 1);
      assert.ok(Math.abs(unlockedLine.unit_price - atLive) < EXACT,
        `unlocked estimate ${unlockedLine.unit_price} != ${atLive} at the live spot`);
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

// ------------------------------------------------- the $26.81 regression pin

test("no body-supplied price, spot or order object is accepted at all", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const owner = await aUser(c);
    const order = await anOrder(c, owner, { direction: "purchase", status: "Pending" })
      .withLines({ metal_id: gold.id, content: 1, premium: 1, price: 100 });

    await as({ ...owner, role: "user" }, async () => {
      const clean = await request(app).post("/api/quotes/order").send({ order_id: order.id });
      assert.equal(clean.status, 200);

      const poisoned = await request(app).post("/api/quotes/order").send({
        order_id: order.id,
        spots: [{ type: "Gold", name: "Gold", ask_spot: 1, bid_spot: 1, ask: 1, bid: 1 }],
        spot_prices: [{ type: "Gold", ask_spot: 1, bid_spot: 1 }],
        order_spots: [{ type: "Gold", bid_spot: 1 }],
        ask_spot: 1,
        bid_spot: 1,
        price: 0.01,
        total: 0.01,
        items: [{ id: order.id, price: 0.01 }],
        // A whole order riding along, its id matching so the ownership guard
        // resolves the same order either way - and every field of it ignored.
        order: { id: order.id, total_price: 0.01, order_items: [] },
      });
      // 400: the body is ONE id, strictly (D214 item 11). These fields used
      // to be IGNORED - the quote read only the order id and answered the same
      // number either way - and are REFUSED now, which is the stronger
      // property: a field the schema has no place for cannot be read by
      // accident later.
      assert.equal(poisoned.status, 400, "the order quote accepted something price-shaped");
      assert.ok(clean.body.total !== 0.01, "the clean quote itself came back at the poison value");
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});
