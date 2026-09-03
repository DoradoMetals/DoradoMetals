// THE ORDER RULES, WITHOUT POSTGRES. Every function under test is pure, which
// is the point of the file existing: what a direction means, what a placement
// freezes and what a payment fact implies are decisions, and a decision that
// needs a database to assert is a decision hidden inside a query.
import { test } from "vitest";
import assert from "node:assert/strict";
import * as rules from "#domain/orders/rules.ts";
import { Conflict, Invalid } from "#shared/errors.ts";

// `spotSideFor` and `premiumSourceFor` LEFT WITH THIS FILE'S SUBJECT (D214
// item 11): both were pure commentary - nothing but this test ever called
// either - and the decisions they named are now enforced where they are made.
// `rateMaterialFor` stays because retierPlan reads it.
test("which percentage column of the band a line reads", () => {
  assert.equal(rules.rateMaterialFor({ bullion_id: null }), "scrap");
  assert.equal(rules.rateMaterialFor({ bullion_id: "abc" }), "bullion");
  assert.equal(rules.rateMaterialFor({}), "scrap");
});

test("sales tax is charged, never paid", () => {
  assert.equal(rules.chargesSalesTax("sale"), true);
  assert.equal(rules.chargesSalesTax("purchase"), false);
});

// THE PREMIUM IS THE BUSINESS'S, NOT THE BROWSER'S: it is tiered by the order's
// TOTAL content of that metal, so two half-ounce lines earn the one-ounce band.
const BANDS = [
  { metal: "Gold", min_qty: 0, max_qty: 1, scrap_pct: 0.8, bullion_pct: 0.9 },
  { metal: "Gold", min_qty: 1, max_qty: null, scrap_pct: 0.87, bullion_pct: 0.95 },
] as unknown as rules.RateBand[];

// The lines retierPlan is handed are orders.items rows: `bullion_id` says
// which kind, and null is scrap.
const scrapLine = (over: Partial<rules.PricedLine> = {}): rules.PricedLine => ({
  id: "s", metal: "Gold", content: 1, quantity: 1, bullion_id: null, ...over,
});
const bullionLine = (over: Partial<rules.PricedLine> = {}): rules.PricedLine => ({
  id: "b", metal: "Gold", content: 1, quantity: 1, bullion_id: "a-product", ...over,
});

test("re-tiering prices every scrap line at the band the ORDER's total earns", () => {
  const plan = rules.retierPlan(BANDS, [
    scrapLine({ id: "a", content: 0.6 }),
    scrapLine({ id: "b", content: 0.6 }),
  ]);
  assert.deepEqual(plan, [
    { id: "a", premium: 0.87 },
    { id: "b", premium: 0.87 },
  ]);
});

// JACOB, 2026-09-03: "PURCHASE BULLION DOES NOT take its product bid premium.
// It comes from rates as well." The band is the same band; the column is not.
test("a purchase bullion line takes the band's bullion_pct, not its product's premium", () => {
  assert.deepEqual(rules.retierPlan(BANDS, [bullionLine({ id: "b", content: 0.5 })]), [
    { id: "b", premium: 0.9 },
  ]);
  // Over the boundary it earns the upper band, still on the bullion column.
  assert.deepEqual(rules.retierPlan(BANDS, [bullionLine({ id: "b", content: 2 })]), [
    { id: "b", premium: 0.95 },
  ]);
});

// A MIXED ORDER TIERS AS ONE PARCEL OF METAL. Half an ounce of scrap and half
// an ounce of bullion are an ounce of gold, so both cross into the upper band -
// and each then reads its own column of it.
test("scrap and bullion of one metal tier by their COMBINED content", () => {
  const plan = rules.retierPlan(BANDS, [
    scrapLine({ id: "s", content: 0.6 }),
    bullionLine({ id: "b", content: 0.6 }),
  ]);
  assert.deepEqual(plan, [
    { id: "s", premium: 0.87 },
    { id: "b", premium: 0.95 },
  ]);
  // Apart, neither reaches it: the same two lines on two orders stay low.
  assert.deepEqual(rules.retierPlan(BANDS, [scrapLine({ id: "s", content: 0.6 })]), [
    { id: "s", premium: 0.8 },
  ]);
  assert.deepEqual(rules.retierPlan(BANDS, [bullionLine({ id: "b", content: 0.6 })]), [
    { id: "b", premium: 0.9 },
  ]);
});

// QUANTITY IS WHAT MAKES A BULLION LINE'S CONTENT THE METAL IT REALLY IS: the
// column is per unit, so ten one-ounce coins are ten ounces. A scrap line's
// content already describes the whole lot and must NOT be multiplied - the
// asymmetry every sum in domain/pricing keeps.
test("a bullion line's content counts per unit times quantity, and scrap's does not", () => {
  assert.equal(rules.lineContent(bullionLine({ content: 0.5, quantity: 4 })), 2);
  assert.equal(rules.lineContent(scrapLine({ content: 0.5, quantity: 4 })), 0.5);
  // An absent quantity is one, not zero.
  assert.equal(rules.lineContent(bullionLine({ content: 0.5, quantity: null })), 0.5);
  // Three half-ounce coins are an ounce and a half and earn the upper band;
  // one alone does not. (Exactly 1 oz stays in the lower band - getRateBand
  // takes the first whose range contains the total, and 0-1 is inclusive.)
  assert.deepEqual(rules.retierPlan(BANDS, [bullionLine({ content: 0.5, quantity: 3 })]), [
    { id: "b", premium: 0.95 },
  ]);
  assert.deepEqual(rules.retierPlan(BANDS, [bullionLine({ content: 0.5, quantity: 1 })]), [
    { id: "b", premium: 0.9 },
  ]);
});

test("no rate bands means no plan - an order keeps what it was given", () => {
  // The alternative is repricing an order to nothing when rates are not
  // configured, which is worse than leaving the submitted premium alone.
  assert.deepEqual(rules.retierPlan([], [scrapLine({ id: "a" })]), []);
  assert.deepEqual(rules.retierPlan(null, [scrapLine({ id: "a" })]), []);
  assert.deepEqual(rules.retierPlan(BANDS, []), []);
  // A metal with no band at all is skipped rather than priced at zero - for
  // bullion as much as for scrap.
  assert.deepEqual(rules.retierPlan(BANDS, [scrapLine({ id: "a", metal: "Silver" })]), []);
  assert.deepEqual(rules.retierPlan(BANDS, [bullionLine({ id: "a", metal: "Silver" })]), []);
});

// ONE QUOTE PER METAL THE ORDER ACTUALLY CONTAINS. exchange wrote a row per
// metal whether or not the order held any of it.
//
// THE ROWS ARE COMPLETE (D214 item 11): the rule answers `NewOrderSpot[]` with
// the order_id on every row, so the use case is one line -
// `orderSpots.createMany(rules.spotsToFreeze(order_id, lines, live), tx)`.
test("freezing quotes each distinct metal on the order once, at the live spot", () => {
  const live = [
    { id: "gold", ask: 3400, bid: 3300 },
    { id: "silver", ask: 40, bid: 39 },
  ];
  assert.deepEqual(
    rules.spotsToFreeze(
      "order-1",
      [{ metal_id: "gold" }, { metal_id: "gold" }, { metal_id: "silver" }],
      live
    ),
    [
      { order_id: "order-1", metal_id: "gold", ask: 3400, bid: 3300 },
      { order_id: "order-1", metal_id: "silver", ask: 40, bid: 39 },
    ]
  );
  // A metal nobody sold gets no row.
  assert.deepEqual(rules.spotsToFreeze("order-1", [], live), []);
});

// A METAL WITH NO LIVE QUOTE IS REFUSED, WHERE IT USED TO BE FROZEN AT NULL.
// Every money figure on the order is content * (spot * premium), so a null spot
// prices that metal at nothing - silently, on an order the business pays out.
test("a metal the feed has not quoted refuses the placement", () => {
  const live = [{ id: "gold", ask: 3400, bid: 3300 }];
  assert.throws(
    () => rules.spotsToFreeze("order-1", [{ metal_id: "platinum" }], live),
    (err: unknown) => err instanceof Invalid && /no live quote for metal platinum/.test((err as Error).message)
  );
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
    rules.attachmentVerdict({ order_id: "s1", direction: "sale", payment_status: "succeeded" }),
    "conflict"
  );
  assert.equal(
    rules.attachmentVerdict({ order_id: "s1", direction: "sale", payment_status: "processing" }),
    "conflict"
  );
  // An unsettled sale paid for nothing: cancel it, detach, proceed. Refusing
  // would strand exactly the customer trying to give the business money.
  assert.equal(
    rules.attachmentVerdict(
      { order_id: "s1", direction: "sale", payment_status: "requires_payment_method" }
    ),
    "supersede"
  );
  // A purchase never yields its intent, settled or not.
  assert.equal(
    rules.attachmentVerdict(
      { order_id: "p1", direction: "purchase", payment_status: "requires_payment_method" }
    ),
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

// ===========================================================================
// THE ROWS A LINE BECOMES, AND WHAT AN OPERATION REQUIRES (D214 item 11)
// ===========================================================================
//
// Every function below is new with the streamlining pass, and every one is the
// ASSERT or the derivation step of a use case that used to do the same work
// inline, through a cast, over a document the browser sent.

test("a catalogue line takes its weights from the product and no premium", () => {
  const product = {
    id: "prod-1", metal_id: "gold", gross: 1.1, content: 1, purity: 0.9999,
  } as unknown as Parameters<typeof rules.lineFromProduct>[1];

  assert.deepEqual(rules.lineFromProduct("order-1", product), {
    order_id: "order-1",
    bullion_id: "prod-1",
    metal_id: "gold",
    pre_melt: 1.1,
    post_melt: 1,
    purity: 0.9999,
    content: 1,
    quantity: 1,
    confirmed: false,
    unit: "t oz",
  });
});

test("a scrap line derives its content from the weight, the unit and the purity", () => {
  assert.deepEqual(
    rules.lineFromScrap("order-1", {
      metal_id: "gold", pre_melt: 160, purity: 0.5, unit: "dwt",
    }),
    {
      order_id: "order-1",
      metal_id: "gold",
      pre_melt: 160,
      purity: 0.5,
      unit: "dwt",
      // 160 pennyweight is 8 troy ounces; half of that is fine metal.
      content: 4,
      quantity: 1,
      confirmed: false,
    }
  );
});

// The five ids a shipping checkout must hold, NAMED in the refusal - a caller
// that is one field short is told which one, and gets the values back NARROWED
// rather than as `string | null` it would have to assert away.
const completeCheckout = {
  shipper_address_id: "a", package_id: "b", carrier_service_id: "c",
  fulfillment_id: "d", payment_details_id: "e",
  recipient_address_id: "f",
  pickup_date: "2026-09-04", pickup_time: "14:00",
} as unknown as Parameters<typeof rules.assertPlaceableAsPurchase>[0];

const aCart = [{ id: "line", metal_id: "m" }] as unknown as rules.CheckoutLine[];

test("a complete shipping checkout passes, and a short one names what is missing", () => {
  assert.deepEqual(rules.assertPlaceableAsPurchase(completeCheckout, aCart), {
    shipper_address_id: "a", package_id: "b", carrier_service_id: "c",
    fulfillment_id: "d", payment_details_id: "e",
  });

  assert.throws(
    () =>
      rules.assertPlaceableAsPurchase(
        Object.assign({}, completeCheckout, { package_id: null }), aCart
      ),
    (err: unknown) => err instanceof Invalid && /missing package_id/.test((err as Error).message)
  );
});

// A checkout with nothing in it cannot become an order in either direction.
test("an empty cart is refused before any id is looked at", () => {
  for (const assertPlaceable of [
    rules.assertPlaceableAsPurchase, rules.assertPlaceableAsSale,
  ]) {
    assert.throws(
      () => assertPlaceable(completeCheckout, []),
      (err: unknown) => err instanceof Invalid && /no items/.test((err as Error).message)
    );
  }
});

test("a sale needs somewhere to be delivered", () => {
  assert.deepEqual(rules.assertPlaceableAsSale(completeCheckout, aCart), {
    recipient_address_id: "f",
  });
  assert.throws(
    () =>
      rules.assertPlaceableAsSale(
        Object.assign({}, completeCheckout, { recipient_address_id: null }), aCart
      ),
    (err: unknown) =>
      err instanceof Invalid && /missing recipient_address_id/.test((err as Error).message)
  );
});

// The slot is the carrier pickup handoff's, not the checkout's: the schedulable
// handoff is what makes a date and a time compulsory.
const DROPOFF = {
  code: "DROPOFF", name: "Store Dropoff", requires_schedule: false,
  has_dropoff_locations: true, display_order: 1,
};
const COLLECTION = {
  code: "PICKUP", name: "Carrier Pickup", requires_schedule: true,
  has_dropoff_locations: false, display_order: 2,
};
const A_SERVICE = { carrier_id: "c", name: "Express Saver", serviceType: "SAVER", carrierCode: "FDXE" };
const A_BOX = { length: 10, width: 8, height: 6 } as unknown as Parameters<typeof rules.parcelFor>[3];

test("a carrier pickup needs a date and a time, and a dropoff carries no slot", () => {
  const placeable = rules.assertPlaceableAsPurchase(completeCheckout, aCart);
  const collected = rules.parcelFor(
    completeCheckout, placeable, A_SERVICE, A_BOX, COLLECTION, 2500, 2
  );
  assert.deepEqual(collected.schedule, { date: "2026-09-04", time: "14:00" });
  assert.equal(collected.weight.value, 2);
  assert.equal(collected.declaredValue, 2500);

  assert.equal(
    rules.parcelFor(completeCheckout, placeable, A_SERVICE, A_BOX, DROPOFF, 0, 2).schedule,
    null
  );

  assert.throws(
    () =>
      rules.parcelFor(
        Object.assign({}, completeCheckout, { pickup_time: null }),
        placeable, A_SERVICE, A_BOX, COLLECTION, 0, 2
      ),
    Invalid
  );
});

// A carrier that quoted nothing for the chosen service is a refusal, never a
// zero the business then eats.
test("postage with no quote is refused rather than priced at nothing", () => {
  assert.equal(
    rules.quotedCharge(
      [{ serviceType: "SAVER", netCharge: 24.5 }, { serviceType: "OTHER", netCharge: 9 }],
      "SAVER"
    ),
    24.5
  );
  assert.throws(() => rules.quotedCharge([{ serviceType: "OTHER", netCharge: 9 }], "SAVER"), Invalid);
  assert.throws(() => rules.quotedCharge([{ serviceType: "SAVER", netCharge: null }], "SAVER"), Invalid);
});

test("an operation of the wrong direction is refused, naming both", () => {
  assert.doesNotThrow(() => rules.assertDirection("purchase", "purchase", "cancelling"));
  assert.throws(
    () => rules.assertDirection("sale", "purchase", "cancelling"),
    (err: unknown) =>
      err instanceof Invalid &&
      /cancelling is a purchase-direction operation and this is a sale order/.test(
        (err as Error).message
      )
  );
  assert.throws(() => rules.assertDirection(null, "purchase", "cancelling"), Invalid);
});

// A sale on its way to a refiner. The address is the ORDER's snapshot, so an
// order without one cannot say where the metal goes.
const sendable = {
  order: { number: 42, order_sent: false },
  address: { line_1: "1 Main St", phone_number: "555" },
  user: { name: "Ada" },
} as unknown as Parameters<typeof rules.assertSendable>[0];

test("an order reaches a refiner only with an address, an email and no other refiner", () => {
  assert.doesNotThrow(() =>
    rules.assertSendable(sendable, {
      refiner_id: "r1", attachedRefinerId: null, refinerEmail: "r@example.com",
    })
  );

  assert.throws(
    () =>
      rules.assertSendable(Object.assign({}, sendable, { address: null }), {
        refiner_id: "r1", attachedRefinerId: null, refinerEmail: "r@example.com",
      }),
    (err: unknown) => err instanceof Invalid && /has no address/.test((err as Error).message)
  );

  assert.throws(
    () =>
      rules.assertSendable(sendable, {
        refiner_id: "r1", attachedRefinerId: null, refinerEmail: null,
      }),
    (err: unknown) => err instanceof Invalid && /has no email address/.test((err as Error).message)
  );

  // A SENT ORDER MAY BE RE-SENT TO THE SAME REFINER and never moved.
  const sent = {
    order: { number: 42, order_sent: true },
    address: sendable.address,
    user: sendable.user,
  } as unknown as Parameters<typeof rules.assertSendable>[0];

  assert.doesNotThrow(() =>
    rules.assertSendable(sent, {
      refiner_id: "r1", attachedRefinerId: "r1", refinerEmail: "r@example.com",
    })
  );
  assert.throws(
    () =>
      rules.assertSendable(sent, {
        refiner_id: "r2", attachedRefinerId: "r1", refinerEmail: "r@example.com",
      }),
    Conflict
  );
});

// THE RETURN LABEL'S REQUEST. Where the parcel goes is the order's own
// snapshot and who signs for the business is the provider's configured
// contact - neither is ever a field of the request body.
test("the return label goes from the business to the order's own address", () => {
  const request = rules.returnLabelRequest(sendable, {
    serviceType: "FEDEX_2_DAY",
    weight: { units: "LB", value: 3 },
    dimensions: { length: 10, width: 8, height: 6, units: "IN" },
    declaredValue: 5000,
  });

  assert.equal(request.recipient.address, sendable.address);
  assert.equal(request.recipient.contact.personName, "Ada");
  assert.equal(request.serviceType, "FEDEX_2_DAY");
  assert.deepEqual(request.insurance.declaredValue, { amount: 5000, currency: "USD" });
  assert.ok(request.shipper.address, "the business's own address is the shipper");

  assert.throws(
    () =>
      rules.returnLabelRequest(Object.assign({}, sendable, { address: null }), {
        serviceType: "FEDEX_2_DAY",
        weight: { units: "LB", value: 3 },
        dimensions: { length: 10, width: 8, height: 6, units: "IN" },
        declaredValue: 0,
      }),
    (err: unknown) => err instanceof Invalid && /no address snapshot/.test((err as Error).message)
  );
});
