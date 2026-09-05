import { test, beforeAll } from "vitest";
import assert from "node:assert/strict";
import * as pricing from "#pricing/index.ts";
import query from "#shared/db/query.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { aCart, aUser } from "#shared/testing/builders/index.ts";
import type { PurchaseQuote } from "@dorado/contracts";

const ORDER_LOCKS = [LOCKS.FULFILLMENTS, LOCKS.ORDERS, LOCKS.ADDRESSES];

const methodIdOf = new Map<string, string>();

beforeAll(async () => {
  const methods = await outside<{ id: string; type: string }>(
    `SELECT id, type FROM payments.methods WHERE direction = 'purchase'`
  );
  for (const method of methods) methodIdOf.set(method.type, method.id);
  for (const type of ["ACH", "WIRE", "ECHECK", "DORADO_ACCOUNT"]) {
    assert.ok(methodIdOf.get(type), `dev has no ${type} payout method - these prove nothing`);
  }
});

async function goldBid(): Promise<number> {
  const { rows } = await query<{ bid: number }>(
    `SELECT s.bid FROM spots.spots s
      WHERE s.metal_id = 'Gold'`
  );
  return Number(rows[0]?.bid ?? 0);
}

async function purchaseQuote(checkout_id: string): Promise<PurchaseQuote> {
  const quote = await pricing.priceCheckout(checkout_id);
  assert.equal(quote.direction, "purchase", "the fixture built a purchase basket");
  return quote as PurchaseQuote;
}

test("both deductions apply, and neither cancels the other", async () => {
  await inPinnedTransaction(async (c) => {
    const bare = await aCart(c, await aUser(c), { direction: "purchase" })
      .withLots(1, { metal_id: "Gold", pre_melt: 1, purity: 1, unit: "t oz" });
    const bareQuote = await purchaseQuote(bare.id);

    const paid = await aCart(c, await aUser(c), { direction: "purchase" })
      .withLots(1, { metal_id: "Gold", pre_melt: 1, purity: 1, unit: "t oz" })
      .withRow({ payment_method_id: methodIdOf.get("WIRE") });
    const both = await purchaseQuote(paid.id);

    assert.equal(both.total, bareQuote.total, "the goods total is not what changed");
    assert.equal(both.shipping_charge, 0, "no committed shipping cost exists before placement");
    assert.equal(both.payout_charge, 20, "WIRE costs $20");

    assert.equal(
      Number(both.estimated_payout.toFixed(4)),
      Number((both.total - 20).toFixed(4)),
      "the payout fee did not come off"
    );
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCKS });
});

test("a quote with no choices made yet deducts nothing", async () => {
  await inPinnedTransaction(async (c) => {
    const cart = await aCart(c, await aUser(c), { direction: "purchase" })
      .withLots(1, { metal_id: "Gold", pre_melt: 1, purity: 1, unit: "t oz" });
    const q = await purchaseQuote(cart.id);
    assert.equal(q.shipping_charge, 0);
    assert.equal(q.payout_charge, 0);
    assert.equal(q.estimated_payout, q.total);
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCKS });
});

test("a free payout method deducts nothing, and says so rather than omitting it", async () => {
  await inPinnedTransaction(async (c) => {
    for (const type of ["ACH", "ECHECK", "DORADO_ACCOUNT"]) {
      const cart = await aCart(c, await aUser(c), { direction: "purchase" })
        .withLots(1, { metal_id: "Gold", pre_melt: 1, purity: 1, unit: "t oz" })
        .withRow({ payment_method_id: methodIdOf.get(type) });
      const q = await purchaseQuote(cart.id);
      assert.equal(q.payout_charge, 0, `${type} is free`);
      assert.equal(q.estimated_payout, q.total);
    }
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCKS });
});

test("the payout never goes below zero", async () => {
  await inPinnedTransaction(async (c) => {
    const bid = await goldBid();
    assert.ok(bid > 0, "dev has a gold spot to price against");
    const cart = await aCart(c, await aUser(c), { direction: "purchase" })
      .withLots(1, { metal_id: "Gold", pre_melt: 0.0001, purity: 1, unit: "t oz" })
      .withRow({ payment_method_id: methodIdOf.get("WIRE") });
    const q = await purchaseQuote(cart.id);
    assert.ok(q.total < 70, "the fixture is meant to be smaller than its fees");
    assert.equal(q.estimated_payout, 0);
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCKS });
});

test("a line's price is its content x the bid x the premium the band earns", async () => {
  await inPinnedTransaction(async (c) => {
    const bid = await goldBid();
    const cart = await aCart(c, await aUser(c), { direction: "purchase" })
      .withLots(1, { metal_id: "Gold", pre_melt: 1, purity: 1, unit: "t oz" });
    const q = await purchaseQuote(cart.id);
    const line = q.items[0]!;

    assert.equal(line.kind, "scrap");
    assert.equal(line.content, 1);
    assert.equal(
      Number(line.unit_price.toFixed(6)),
      Number((line.content * (bid * line.premium)).toFixed(6))
    );
    assert.equal(line.line_total, line.unit_price, "a scrap lot is one lot, not a quantity");
    assert.equal(q.total, line.line_total);
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCKS });
});
