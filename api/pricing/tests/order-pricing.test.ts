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

const ORDER_LOCK = LOCKS.ORDERS;

type QuoteLine = {
  id: string;
  kind: string;
  unit_price: number;
  line_total: number;
  source: string;
};

const EXACT = 1e-9;

type SpotFixture = { metal_id: string; bid: number };

let gold: SpotFixture;

beforeAll(async () => {
  const spots = await outside<SpotFixture>(
    `SELECT s.metal_id, s.bid FROM spots.spots s`
  );
  const found = spots.find((s) => s.metal_id === "Gold");
  assert.ok(found?.bid, "dev's Gold spot is not priced - every estimate check here would be vacuous");
  gold = found;
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

async function aQuotableOrder(c: PoolClient) {
  const owner = await aUser(c);
  const product = await aProduct(c, { metal_id: "Gold", content: 1 });

  const specs = [
    { bullion_id: null as string | null, metal_id: gold.metal_id, content: 2, premium: 1, quantity: 1, price: 1500 as number | null },
    { bullion_id: null as string | null, metal_id: gold.metal_id, content: 0.5, premium: 0.9, quantity: 1, price: null as number | null },
    { bullion_id: product.id, metal_id: product.metal_id, content: product.content, premium: 40, quantity: 1, price: 1999 as number | null },
    { bullion_id: product.id, metal_id: product.metal_id, content: product.content, premium: 45, quantity: 2, price: null as number | null },
  ];

  const order = await anOrder(c, owner, { direction: "purchase", status: "Pending" })
    .withLines(...specs.map((s) => ({
      bullion_id: s.bullion_id, metal_id: s.metal_id, content: s.content,
      premium: s.premium, quantity: s.quantity, price: s.price,
    })))
    .withSpots({ bid: null })
    .withTotals({ total: 1 });

  await aPayout(c, owner, { order, payout_fee: 12.5 });
  await aShipment(c, order, { cost: 24.5 });

  const expected = specs.map((s, i) => {
    const kind = s.bullion_id === null ? "scrap" : "product";
    const stored = s.price != null;
    const unit_price = stored ? s.price! : s.content * (gold.bid * s.premium);
    const line_total = kind === "product" ? unit_price * s.quantity : unit_price;
    return { id: order.items[i]!.id, kind, source: stored ? "stored" : "quoted", unit_price, line_total };
  });

  return {
    order, owner: { ...owner, role: "user" as const }, expected,
    payoutCost: 12.5, shippingCharge: 24.5,
  };
}

test("the order quote is the owner's and the admins', and nobody else's", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const owner = await aUser(c);
    const stranger = await aUser(c);
    const order = await anOrder(c, owner, { direction: "purchase", status: "Pending" })
      .withLines({ metal_id: gold.metal_id, content: 1, premium: 1, price: 100 });

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

      const unnamed = await request(app).post("/api/quotes/order").send({});
      assert.equal(unnamed.status, 400, `an unnamed order answered ${unnamed.status}`);
    });

    await as({ ...stranger, role: "admin" }, async () => {
      const res = await request(app).post("/api/quotes/order").send({ order_id: order.id });
      assert.equal(res.status, 200, `an admin was answered ${res.status}: ${JSON.stringify(res.body)}`);
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

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
      assert.ok(
        Math.abs(res.body.total - (scrapTotal + bullionTotal - shippingCharge - payoutCost)) < EXACT,
        `total ${res.body.total} != items ${scrapTotal + bullionTotal} - shipping ${shippingCharge} - payout ${payoutCost}`
      );
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("a locked order prices at its locked spots, an unlocked one at live", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const owner = await aUser(c);
    const order = await anOrder(c, owner, { direction: "purchase", status: "Pending" })
      .withLines({ metal_id: gold.metal_id, content: 3, premium: 1, price: null })
      .withSpots({ bid: null });
    const target = order.items[0]!;

    await as({ ...owner, role: "user" }, async () => {
      await c.query(
        `UPDATE orders.spots SET bid = $1 WHERE order_id = $2 AND metal_id = $3`,
        [1234.56, order.id, gold.metal_id]
      );

      await c.query(`UPDATE orders.orders SET spots_locked = true WHERE id = $1`, [order.id]);
      const locked = await request(app).post("/api/quotes/order").send({ order_id: order.id });
      assert.equal(locked.status, 200, `answered ${locked.status}: ${JSON.stringify(locked.body)}`);
      const lockedLine = locked.body.items.find((l: QuoteLine) => l.id === target.id);
      assert.ok(lockedLine, `item ${target.id} is missing from the locked quote`);
      assert.equal(lockedLine.source, "quoted");
      const atPin = 3 * (1234.56 * 1);
      assert.ok(Math.abs(lockedLine.unit_price - atPin) < EXACT,
        `locked estimate ${lockedLine.unit_price} != ${atPin} at the pinned spot`);

      await c.query(
        `UPDATE orders.orders SET spots_locked = false WHERE id = $1`, [order.id]
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

test("no body-supplied price, spot or order object is accepted at all", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const owner = await aUser(c);
    const order = await anOrder(c, owner, { direction: "purchase", status: "Pending" })
      .withLines({ metal_id: gold.metal_id, content: 1, premium: 1, price: 100 });

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
        order: { id: order.id, total_price: 0.01, order_items: [] },
      });
      assert.equal(poisoned.status, 400, "the order quote accepted something price-shaped");
      assert.ok(clean.body.total !== 0.01, "the clean quote itself came back at the poison value");
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});
