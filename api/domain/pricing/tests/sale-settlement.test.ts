import { test, beforeAll } from "vitest";
import assert from "node:assert/strict";
import * as pricing from "#domain/pricing/index.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { aCart, aProduct, aUser } from "#shared/testing/builders/index.ts";
import type { PoolClient } from "pg";
import type { SaleQuote } from "@dorado/contracts";

const SALE_LOCKS = [LOCKS.FULFILLMENTS, LOCKS.ORDERS, LOCKS.ADDRESSES];

const methodIdOf = new Map<string, string>();

beforeAll(async () => {
  const methods = await outside<{ id: string; type: string }>(
    `SELECT id, type FROM payments.methods WHERE direction = 'sale'`
  );
  for (const method of methods) methodIdOf.set(method.type, method.id);
  for (const type of ["CARD", "ACH", "CREDIT"]) {
    assert.ok(methodIdOf.get(type), `dev has no ${type} sale method - these prove nothing`);
  }
});

async function saleQuote(checkout_id: string): Promise<SaleQuote> {
  const quote = await pricing.priceCheckout(checkout_id);
  assert.equal(quote.direction, "sale", "the fixture built a sale basket");
  return quote as SaleQuote;
}

async function aBasket(
  c: PoolClient, funds: number, method: string
): Promise<SaleQuote> {
  const product = await aProduct(c, { metal: "Gold", content: 1, ask_premium: 1 });
  const cart = await aCart(c, await aUser(c, { funds }), { direction: "sale" })
    .withBullion(product, 1)
    .withRow({ payment_method_id: methodIdOf.get(method) });
  return await saleQuote(cart.id);
}

test("no balance leaves the whole total on the card", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const q = await aBasket(c, 0, "CREDIT");
    assert.ok(q.item_total > 0, "the fixture priced at the live gold ask");
    assert.equal(q.beginning_funds, 0);
    assert.equal(q.pre_charges_amount, 0);
    assert.equal(q.subject_to_charges_amount, q.base_total);
    assert.equal(q.payment_surface, "card");
  }, { actor: TEST_ACTOR.id, lock: SALE_LOCKS });
});

test("a partial balance still leaves something to charge", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const priced = await aBasket(c, 0, "CREDIT");
    const q = await aBasket(c, Number((priced.base_total / 2).toFixed(2)), "CREDIT");
    assert.ok(q.pre_charges_amount > 0, "the balance was applied");
    assert.ok(q.subject_to_charges_amount > 0, "and did not cover the order");
    assert.equal(q.payment_surface, "card");
    assert.equal(
      Number(q.ending_funds.toFixed(6)),
      Number((q.beginning_funds - q.pre_charges_amount).toFixed(6))
    );
  }, { actor: TEST_ACTOR.id, lock: SALE_LOCKS });
});

test("a balance that covers the order shows no card at all", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const priced = await aBasket(c, 0, "CREDIT");
    const q = await aBasket(c, Math.ceil(priced.base_total) + 1000, "CREDIT");
    assert.equal(q.pre_charges_amount, q.base_total, "the whole order came out of credit");
    assert.equal(q.subject_to_charges_amount, 0);
    assert.equal(q.charges_amount, 0);
    assert.equal(q.post_charges_amount, 0);
    assert.equal(q.payment_surface, "credit");
    assert.equal(q.order_total, q.base_total);
    assert.equal(
      Number(q.ending_funds.toFixed(6)),
      Number((q.beginning_funds - q.base_total).toFixed(6))
    );
  }, { actor: TEST_ACTOR.id, lock: SALE_LOCKS });
});

test("more credit than the order costs is still credit - the surplus is not charged", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const priced = await aBasket(c, 0, "CREDIT");
    const q = await aBasket(c, Math.ceil(priced.base_total) * 5, "CREDIT");
    assert.equal(q.payment_surface, "credit");
    assert.ok(q.ending_funds > 0, "the surplus stayed on the account");
  }, { actor: TEST_ACTOR.id, lock: SALE_LOCKS });
});

test("a sliver below Stripe's minimum is charged, not waved through", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const priced = await aBasket(c, 0, "ACH");
    const funds = Number((priced.base_total - 0.4).toFixed(6));
    const q = await aBasket(c, funds, "ACH");

    assert.equal(
      Number(q.subject_to_charges_amount.toFixed(6)), 0.5,
      "the holdback did not land on the minimum"
    );
    assert.equal(q.payment_surface, "card");
    assert.equal(
      Number(q.charges_amount.toFixed(6)),
      Number((0.5 * 0.005).toFixed(6)),
      "ACH's own surcharge row is what was taken"
    );
  }, { actor: TEST_ACTOR.id, lock: SALE_LOCKS });
});

test("the surcharge is the payment method row's, not a number in code", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    for (const [type, percent] of [["CARD", 0.029], ["ACH", 0.005]] as const) {
      const q = await aBasket(c, 0, type);
      assert.equal(
        Number(q.charges_amount.toFixed(6)),
        Number((q.subject_to_charges_amount * percent).toFixed(6)),
        `${type} did not take the surcharge its row advertises`
      );
      assert.equal(
        Number(q.order_total.toFixed(6)),
        Number((q.pre_charges_amount + q.post_charges_amount).toFixed(6))
      );
    }
  }, { actor: TEST_ACTOR.id, lock: SALE_LOCKS });
});

test("a sale line prices at content x ask x ask premium, and totals by quantity", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const [spot] = await outside<{ ask: number }>(
      `SELECT s.ask FROM spots.spots s
         JOIN metals.metals m ON m.id = s.metal_id
        WHERE m.name = 'Gold'`
    );
    assert.ok(spot, "dev has a gold spot to price against");

    const product = await aProduct(c, { metal: "Gold", content: 2, ask_premium: 1.1 });
    const cart = await aCart(c, await aUser(c), { direction: "sale" })
      .withBullion(product, 3);
    const q = await saleQuote(cart.id);
    const line = q.items[0]!;

    assert.equal(
      Number(line.unit_ask.toFixed(6)),
      Number((2 * (Number(spot.ask) * 1.1)).toFixed(6))
    );
    assert.equal(Number(line.line_total.toFixed(6)), Number((line.unit_ask * 3).toFixed(6)));
    assert.equal(Number(q.item_total.toFixed(6)), Number(line.line_total.toFixed(6)));
  }, { actor: TEST_ACTOR.id, lock: SALE_LOCKS });
});

test("shipping is free over $1000 and the service row's price under it", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const options = await outside<{ code: string; price: number }>(
      `SELECT code, price FROM shipping.services
        WHERE carrier_id IS NULL AND price IS NOT NULL AND is_active`
    );
    assert.ok(options.length >= 3, "the sale service rows are missing - did 110 run?");
    const q = await aBasket(c, 0, "CARD");
    assert.equal(
      q.shipping_charge, 0,
      "a basket with no fulfillment names no service, so it is charged nothing"
    );
    assert.ok(q.item_total > 1000, "gold at one ounce is over the free-shipping threshold");
  }, { actor: TEST_ACTOR.id, lock: SALE_LOCKS });
});
