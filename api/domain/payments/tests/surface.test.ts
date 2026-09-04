// WHICH PAYMENT SURFACE THE CUSTOMER IS SHOWN. Pure - no database, no
// provider, no request.
//
// *** WHY IT IS THE SERVER'S ANSWER. *** The buy checkout used to compute
// `beginning_funds < base_total` in the browser and mount (or not mount)
// Stripe's payment element on the result. That is money reasoning in a client,
// and it disagreed with the server in the one case nobody looks at: when
// applied credit would leave a sliver under Stripe's $0.50 minimum, the
// pricing holds credit BACK so the card pays exactly $0.50 - so a balance can
// exceed the base total and a card still be charged. The browser's comparison
// says "credit" there and no element renders, leaving a customer who cannot
// pay.
//
// `paymentSurface` asks the same question of `post_charges_amount`, which is
// the number Stripe is actually told, so the surface and the charge cannot
// disagree.
import { test } from "vitest";
import assert from "node:assert/strict";
import { paymentSurface } from "#domain/payments/rules.ts";
import { calculateSalesOrderTotal } from "#domain/pricing/ask.ts";
import type { Spots } from "#domain/pricing/spot.ts";

const SPOTS: Spots = [
  { id: "s-gold", name: "Gold", ask: 1000, bid: 990 },
] as unknown as Spots;

// One gold ounce at a 1.0 premium: $1000 of metal, no tax, no shipping charge
// (over the $1000 free-shipping line).
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

// THE CASE THE BROWSER'S COMPARISON GOT WRONG. $999.60 of credit against a
// $1000 order leaves 40 cents, which Stripe will not take - so the pricing
// holds back credit until the card owes exactly $0.50 and CHARGES it. The old
// expression (`beginning_funds < base_total`) is true here too, so it happens
// to agree; the pin is that the amount actually charged is what decides, and
// it is chargeable.
test("a sliver below Stripe's minimum is charged, not waved through", () => {
  const prices = calculateSalesOrderTotal(
    aBasket(), SPOTS, { dorado_funds: 999.6 }, null, "ACH"
  );
  assert.equal(
    prices.subject_to_charges_amount, 0.5, "the holdback did not land on the minimum"
  );
  assert.equal(paymentSurface(prices.post_charges_amount), "card");
});

// And the boundary itself: anything under Stripe's floor is not a charge.
test("an amount below the floor is not a card surface", () => {
  assert.equal(paymentSurface(0.49), "credit");
  assert.equal(paymentSurface(0.5), "card");
  assert.equal(paymentSurface(0), "credit");
});
