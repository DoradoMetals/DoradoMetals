import { test } from "vitest";
import assert from "node:assert/strict";
import { paymentSurface } from "#domain/payments/rules.ts";
import { calculateSalesOrderTotal } from "#domain/pricing/ask.ts";
import type { Spots } from "#domain/pricing/spot.ts";

const SPOTS: Spots = [
  { id: "s-gold", name: "Gold", ask: 1000, bid: 990 },
] as unknown as Spots;

const aBasket = () => [
  { metal_type: "Gold", content: 1, ask_premium: 1, quantity: 1, sales_tax_rate: 0 },
];

const surfaceFor = (dorado_funds: number) =>
  paymentSurface(
    calculateSalesOrderTotal(aBasket(), SPOTS, { dorado_funds }, null, "CREDIT")
      .post_charges_amount
  );

test("no balance leaves the whole total on the card", () => {
  assert.equal(surfaceFor(0), "card");
});

test("a partial balance still leaves something to charge", () => {
  assert.equal(surfaceFor(400), "card");
});

test("a balance that covers the order shows no card at all", () => {
  assert.equal(surfaceFor(1000), "credit");
});

test("more credit than the order costs is still credit - the surplus is not charged", () => {
  assert.equal(surfaceFor(5000), "credit");
});

test("a sliver below Stripe's minimum is charged, not waved through", () => {
  const prices = calculateSalesOrderTotal(
    aBasket(), SPOTS, { dorado_funds: 999.6 }, null, "ACH"
  );
  assert.equal(
    prices.subject_to_charges_amount, 0.5, "the holdback did not land on the minimum"
  );
  assert.equal(paymentSurface(prices.post_charges_amount), "card");
});

test("an amount below the floor is not a card surface", () => {
  assert.equal(paymentSurface(0.49), "credit");
  assert.equal(paymentSurface(0.5), "card");
  assert.equal(paymentSurface(0), "credit");
});
