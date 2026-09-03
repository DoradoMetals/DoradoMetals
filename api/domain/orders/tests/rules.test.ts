// THE ORDER RULES, WITHOUT POSTGRES. Every function under test is pure, which
// is the point of the file existing: what a direction means, what a placement
// freezes and what a payment fact implies are decisions, and a decision that
// needs a database to assert is a decision hidden inside a query.
import test from "node:test";
import assert from "node:assert/strict";
import * as rules from "#domain/orders/rules.ts";

test("a purchase is priced from the bid and a sale from the ask", () => {
  // We BID to buy metal from a customer and ASK to sell it to them.
  assert.equal(rules.spotSideFor("purchase"), "bid");
  assert.equal(rules.spotSideFor("sale"), "ask");
});

test("a premium comes from the rates table for scrap and from the line for bullion", () => {
  assert.equal(rules.premiumSourceFor("purchase", { bullion_id: null }), "rate-tier");
  assert.equal(rules.premiumSourceFor("purchase", { bullion_id: "abc" }), "line-premium");
  // A sale is always bullion, quoted at the product's ask premium.
  assert.equal(rules.premiumSourceFor("sale", { bullion_id: "abc" }), "product-ask-premium");
  assert.equal(rules.premiumSourceFor("sale", { bullion_id: null }), "product-ask-premium");
});

test("sales tax is charged, never paid", () => {
  assert.equal(rules.chargesSalesTax("sale"), true);
  assert.equal(rules.chargesSalesTax("purchase"), false);
});

// NaN IS "NOT MEASURED" AND MUST REACH THE DATABASE AS NULL - D47/D65. A number
// that is not a number stored as a number is a price computed from nonsense.
//
// THE ZEROES BELOW ARE PRESERVED BEHAVIOUR, NOT ENDORSED. convertTroyOz answers
// 0 for an unparseable weight and for a unit it does not recognise, and null
// multiplies as 0 - so those cases store 0 rather than "not measured", exactly
// as they did before. Only a genuinely undefined purity reaches NaN, and that is
// the case the null exists for.
test("content is weight in troy ounces times purity, and unmeasurable is null", () => {
  assert.equal(rules.scrapContent(8, "t oz", 0.5), 4);
  assert.equal(rules.scrapContent(160, "dwt", 0.5), 4);
  assert.equal(rules.scrapContent(8, "t oz", undefined), null);
  assert.equal(rules.scrapContent(undefined, "t oz", 0.5), 0);
  assert.equal(rules.scrapContent(null, "t oz", 0.5), 0);
  assert.equal(rules.scrapContent(8, "t oz", null), 0);
  assert.equal(rules.scrapContent(8, "not-a-unit", 0.5), 0);
});

// THE PREMIUM IS THE BUSINESS'S, NOT THE BROWSER'S: it is tiered by the order's
// TOTAL content of that metal, so two half-ounce lines earn the one-ounce band.
const BANDS = [
  { metal: "Gold", min_qty: 0, max_qty: 1, scrap_pct: 0.8, bullion_pct: 0.9 },
  { metal: "Gold", min_qty: 1, max_qty: null, scrap_pct: 0.87, bullion_pct: 0.95 },
] as unknown as rules.RateBand[];

test("re-tiering prices every scrap line at the band the ORDER's total earns", () => {
  const plan = rules.retierPlan(BANDS, [
    { id: "a", metal: "Gold", content: 0.6 },
    { id: "b", metal: "Gold", content: 0.6 },
  ]);
  assert.deepEqual(plan, [
    { id: "a", premium: 0.87 },
    { id: "b", premium: 0.87 },
  ]);
});

test("no rate bands means no plan - an order keeps what it was given", () => {
  // The alternative is repricing an order to nothing when rates are not
  // configured, which is worse than leaving the submitted premium alone.
  assert.deepEqual(rules.retierPlan([], [{ id: "a", metal: "Gold", content: 1 }]), []);
  assert.deepEqual(rules.retierPlan(null, [{ id: "a", metal: "Gold", content: 1 }]), []);
  assert.deepEqual(rules.retierPlan(BANDS, []), []);
  // A metal with no band at all is skipped rather than priced at zero.
  assert.deepEqual(rules.retierPlan(BANDS, [{ id: "a", metal: "Silver", content: 1 }]), []);
});

// ONE QUOTE PER METAL THE ORDER ACTUALLY CONTAINS. exchange wrote a row per
// metal whether or not the order held any of it.
test("freezing quotes each distinct metal on the order once, at the live spot", () => {
  const live = [
    { id: "gold", ask: 3400, bid: 3300 },
    { id: "silver", ask: 40, bid: 39 },
  ];
  assert.deepEqual(
    rules.spotsToFreeze(
      [{ metal_id: "gold" }, { metal_id: "gold" }, { metal_id: "silver" }],
      live
    ),
    [
      { metal_id: "gold", ask: 3400, bid: 3300 },
      { metal_id: "silver", ask: 40, bid: 39 },
    ]
  );
  // A metal nobody sold gets no row.
  assert.deepEqual(rules.spotsToFreeze([], live), []);
  // A metal with no live quote is frozen unquoted rather than skipped - the
  // LEFT JOIN the statement this replaces always did.
  assert.deepEqual(
    rules.spotsToFreeze([{ metal_id: "platinum" }], live),
    [{ metal_id: "platinum", ask: null, bid: null }]
  );
  // A line with no metal cannot be quoted.
  assert.deepEqual(rules.spotsToFreeze([{ metal_id: null }], live), []);
});

// ===========================================================================
// PAYMENT FACTS (D211)
// ===========================================================================

test("settled means the money is committed, and processing counts", () => {
  assert.equal(rules.isSettled("succeeded"), true);
  assert.equal(rules.isSettled("processing"), true);
  assert.equal(rules.isSettled("requires_payment_method"), false);
  assert.equal(rules.isSettled("canceled"), false);
  assert.equal(rules.isSettled(null), false);
});

test("the charge is in cents, and Stripe's floor is asked about separately", () => {
  assert.equal(rules.chargeCents(126.485), 12649);
  assert.equal(rules.belowStripeMinimum(49), true);
  assert.equal(rules.belowStripeMinimum(50), false);
  // Nothing to charge is not "below the minimum" - it is nothing to charge.
  assert.equal(rules.belowStripeMinimum(0), false);
});

// THE LABEL DERIVES FROM A MONEY FACT, not from the method's name. The old code
// keyed on `payment_method === "CREDIT"` and got full-credit coverage wrong.
test("an order with nothing left to charge is born Preparing", () => {
  assert.equal(rules.statusAtPlacement(0, false), "Preparing");
  assert.equal(rules.statusAtPlacement(12649, false), "Pending");
  // Already paid: there is nothing to await.
  assert.equal(rules.statusAtPlacement(12649, true), "Preparing");
});

// A SETTLED INTENT STAYS WITH THE ORDER IT PAID FOR, whatever label either
// order wears - the rule that protects a paid order from a retry.
test("an attached intent is a conflict when it settled and superseded when it did not", () => {
  assert.equal(
    rules.attachmentVerdict({ sales_order_id: "s1", payment_status: "succeeded" }),
    "conflict"
  );
  assert.equal(
    rules.attachmentVerdict({ sales_order_id: "s1", payment_status: "processing" }),
    "conflict"
  );
  // An unsettled sale paid for nothing: cancel it, detach, proceed. Refusing
  // would strand exactly the customer trying to give the business money.
  assert.equal(
    rules.attachmentVerdict({ sales_order_id: "s1", payment_status: "requires_payment_method" }),
    "supersede"
  );
  // A purchase never yields its intent, settled or not.
  assert.equal(
    rules.attachmentVerdict({ purchase_order_id: "p1", payment_status: "requires_payment_method" }),
    "conflict"
  );
  assert.equal(rules.attachmentVerdict({}), "proceed");
});

test("a repair is honoured only at the price that was actually taken", () => {
  assert.equal(rules.repairAmountMatches(12649, 12649), true);
  // pg hands numerics back as strings on some paths; the comparison is by value.
  assert.equal(rules.repairAmountMatches("12649", 12649), true);
  assert.equal(rules.repairAmountMatches(12649, 12650), false);
  assert.equal(rules.repairAmountMatches(null, 12649), false);
});
