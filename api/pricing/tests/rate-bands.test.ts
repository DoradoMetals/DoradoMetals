import { test, beforeAll } from "vitest";
import assert from "node:assert/strict";
import * as pricing from "#pricing/index.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { aCart, aProduct, aUser } from "#shared/testing/builders/index.ts";
import type { PoolClient } from "pg";
import type { PurchaseQuote } from "@dorado/contracts";

const ORDER_LOCKS = [LOCKS.FULFILLMENTS, LOCKS.ORDERS, LOCKS.ADDRESSES];

type Band = { min_qty: number; max_qty: number | null; scrap_pct: number; bullion_pct: number };

let bands: Band[];

beforeAll(async () => {
  bands = await outside<Band>(
    `SELECT r.min_qty, r.max_qty, r.scrap_pct, r.bullion_pct
       FROM rates.rates r JOIN metals.metals m ON m.id = r.metal_id
      WHERE m.name = 'Gold' ORDER BY r.min_qty ASC`
  );
  assert.ok(bands.length >= 2, "dev has no Gold rate bands - these prove nothing");
});

const bandFor = (total: number): Band => {
  const hit = bands.find((b) => total >= b.min_qty && (b.max_qty == null || total <= b.max_qty));
  if (hit) return hit;
  return total < bands[0]!.min_qty ? bands[0]! : bands[bands.length - 1]!;
};

async function purchaseQuote(checkout_id: string): Promise<PurchaseQuote> {
  const quote = await pricing.priceCheckout(checkout_id);
  assert.equal(quote.direction, "purchase");
  return quote as PurchaseQuote;
}

test("every scrap line is priced at the band the WHOLE basket's ounces earn", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const cart = await aCart(c, await aUser(c), { direction: "purchase" })
      .withLots(2, { metal: "Gold", pre_melt: 3, purity: 1, unit: "t oz" });
    const q = await purchaseQuote(cart.id);
    const earned = bandFor(6).scrap_pct;

    assert.equal(q.items.length, 2);
    for (const line of q.items) {
      assert.equal(Number(line.premium), Number(earned), "a line took its own band, not the basket's");
    }
    assert.notEqual(Number(earned), Number(bandFor(3).scrap_pct), "the fixture must cross a band");
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCKS });
});

test("a bullion line reads the bullion column of the same band, and counts its quantity", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const product = await aProduct(c, { metal: "Gold", content: 3, gross: 3, purity: 1 });
    const cart = await aCart(c, await aUser(c), { direction: "purchase" })
      .withBullion(product, 2);
    const q = await purchaseQuote(cart.id);
    const earned = bandFor(6).bullion_pct;

    assert.equal(q.items[0]!.kind, "product");
    assert.equal(Number(q.items[0]!.premium), Number(earned));
    assert.equal(
      Number(q.items[0]!.line_total.toFixed(6)),
      Number((q.items[0]!.unit_price * 2).toFixed(6)),
      "a product line totals by quantity"
    );
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCKS });
});

test("scrap and bullion of one metal share the total but read different columns", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const product = await aProduct(c, { metal: "Gold", content: 3, gross: 3, purity: 1 });
    const cart = await aCart(c, await aUser(c), { direction: "purchase" })
      .withLots(1, { metal: "Gold", pre_melt: 3, purity: 1, unit: "t oz" })
      .withBullion(product, 1);
    const q = await purchaseQuote(cart.id);
    const earned = bandFor(6);

    const scrap = q.items.find((line) => line.kind === "scrap")!;
    const bullion = q.items.find((line) => line.kind === "product")!;
    assert.equal(Number(scrap.premium), Number(earned.scrap_pct));
    assert.equal(Number(bullion.premium), Number(earned.bullion_pct));
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCKS });
});

test("a total below the lowest band still earns the lowest band", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const cart = await aCart(c, await aUser(c), { direction: "purchase" })
      .withLots(1, { metal: "Gold", pre_melt: 0.001, purity: 1, unit: "t oz" });
    const q = await purchaseQuote(cart.id);
    assert.equal(Number(q.items[0]!.premium), Number(bandFor(0.001).scrap_pct));
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCKS });
});

test("a total above every band earns the highest band", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const beyond = (bands[bands.length - 1]!.max_qty ?? bands[bands.length - 1]!.min_qty) + 500;
    const cart = await aCart(c, await aUser(c), { direction: "purchase" })
      .withLots(1, { metal: "Gold", pre_melt: beyond, purity: 1, unit: "t oz" });
    const q = await purchaseQuote(cart.id);
    assert.equal(
      Number(q.items[0]!.premium),
      Number(bands[bands.length - 1]!.scrap_pct)
    );
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCKS });
});

test("a metal with no bands keeps the premium the basket already stored", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const unbanded = await outside<{ name: string }>(
      `SELECT m.name FROM metals.metals m
        WHERE NOT EXISTS (SELECT 1 FROM rates.rates r WHERE r.metal_id = m.id)
        LIMIT 1`
    );
    if (unbanded.length === 0) return;
    const cart = await aCart(c, await aUser(c), { direction: "purchase" })
      .withLots(1, { metal: unbanded[0]!.name as "Gold", pre_melt: 1, purity: 1, unit: "t oz" });
    const q = await purchaseQuote(cart.id);
    assert.equal(Number(q.items[0]!.premium), 0, "no band and no stored premium is zero");
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCKS });
});
