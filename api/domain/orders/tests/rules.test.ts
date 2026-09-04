// THE ORDER RULES, WITHOUT POSTGRES. Every function under test is pure, which
// is the point of the file existing: what a direction means, what a placement
// freezes and what a payment fact implies are decisions, and a decision that
// needs a database to assert is a decision hidden inside a query.
import { test } from "vitest";
import assert from "node:assert/strict";
import * as rules from "#domain/orders/rules.ts";
import { Conflict, Invalid } from "#shared/errors.ts";
import type { OrderView, PricedLine, RateRead } from "@dorado/contracts";

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
] as unknown as RateRead[];

// The lines retierPlan is handed are orders.items rows: `bullion_id` says
// which kind, and null is scrap.
const scrapLine = (over: Partial<PricedLine> = {}): PricedLine => ({
  id: "s", metal: "Gold", content: 1, quantity: 1, bullion_id: null, ...over,
});
const bullionLine = (over: Partial<PricedLine> = {}): PricedLine => ({
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
// THE FREEZE IS A STATEMENT NOW (ruling 66): `orders/spots/sql/freeze.sql`
// copies spots.spots for every distinct metal on the order's lines, so a metal
// the feed has not quoted simply does not JOIN. What is left to decide is what
// a SHORT answer means, and that is this rule - the db test in
// db/orders/spots/tests/ pins the statement itself.
const line = (metal_id: string) => ({ metal_id });

test("every metal the order holds must have been quoted", () => {
  assert.doesNotThrow(() =>
    rules.assertEveryMetalQuoted(
      [line("gold"), line("gold"), line("silver")],
      [{ metal_id: "gold" }, { metal_id: "silver" }]
    )
  );
  // An order with no lines asks for nothing.
  assert.doesNotThrow(() => rules.assertEveryMetalQuoted([], []));
});

// A METAL WITH NO LIVE QUOTE IS REFUSED, WHERE IT USED TO BE FROZEN AT NULL.
// Every money figure on the order is content * (spot * premium), so a null spot
// prices that metal at nothing - silently, on an order the business pays out.
test("a metal the feed has not quoted refuses the placement", () => {
  assert.throws(
    () => rules.assertEveryMetalQuoted([line("platinum")], [{ metal_id: "gold" }]),
    (err: unknown) =>
      err instanceof Invalid && /no live quote for metal platinum/.test((err as Error).message)
  );
});

// A LINE THE COPY DROPPED IS A FAULT, not a refusal: the statement ran two
// statements ago in this transaction, and committing would leave an order
// missing metal the customer is about to post.
test("a short line copy refuses to commit", () => {
  assert.doesNotThrow(() => rules.assertEveryLineCopied(3, 3, "order-1"));
  assert.throws(
    () => rules.assertEveryLineCopied(2, 3, "order-1"),
    (err: unknown) => /3 basket line\(s\) to copy, 2 written/.test((err as Error).message)
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

// A CATALOGUE LINE IS A STATEMENT NOW (ruling 66) -
// `orders/items/sql/create_from_product.sql` copies the product's own rigid
// columns, so there is no rule left to test here; db/orders/items/tests pins
// the copy. A DECLARED LOT still has a decision in it, and this is it.
test("a declared lot derives its content from the weight, the unit and the purity", () => {
  assert.deepEqual(
    rules.declaredLot({ metal_id: "gold", pre_melt: 160, purity: 0.5, unit: "dwt" }),
    {
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

// orders.items.metal_id is NOT NULL: the alternative to refusing is a 23502
// that says nothing about the form the admin filled in.
test("a declared lot with no metal is refused by name", () => {
  assert.throws(
    () => rules.declaredLot({ pre_melt: 160, purity: 0.5, unit: "dwt" }),
    (err: unknown) =>
      err instanceof Invalid && /declared lot needs a metal/.test((err as Error).message)
  );
});

// ONE READINESS ASSERT (rulings 64/66). `missing` is the CHECKOUT's own
// answer, ordered the way the stepper walks it and already narrowed to the
// chosen method's CATEGORY - so a pickup is never refused for having no box.
// Placement states the refusal once instead of re-listing five ids per
// direction, which is what assertPlaceableAsPurchase/AsSale did.
test("a complete checkout places, and a short one names every step it owes", () => {
  assert.doesNotThrow(() => rules.assertPlaceable([]));

  assert.throws(
    () => rules.assertPlaceable(["package", "payout_account"]),
    (err: unknown) =>
      err instanceof Invalid &&
      /missing package, payout_account/.test((err as Error).message)
  );
  // A checkout with nothing in it is refused by the same one line, in either
  // direction: `items` is the first entry of the list the checkout answers.
  assert.throws(
    () => rules.assertPlaceable(["items"]),
    (err: unknown) => err instanceof Invalid && /missing items/.test((err as Error).message)
  );
});

// THE CATEGORY REFUSAL IS GONE (Jacob, 2026-09-04): a placement accepts all
// three, so a DIRECT or PICKUP draft is attached like any other and simply
// buys no label. What is left of the draft rule is the one thing that must
// still be true - nobody else's order has taken it.
test("a draft another order already owns is refused, whatever its category", () => {
  const free = { fulfillment: { order_id: null }, method: { category: "DIRECT" } };
  assert.equal(rules.requireFreeFulfillmentDraft(free), free);

  assert.throws(
    () =>
      rules.requireFreeFulfillmentDraft({
        fulfillment: { order_id: "another-order" }, method: { category: "SHIPMENT" },
      }),
    Conflict
  );
  assert.throws(() => rules.requireFreeFulfillmentDraft(null), Invalid);
});

// THE PARCEL LEFT WITH THE CARRIER (ruling 67). `parcelFor`, `quotedCharge`,
// `handoffFor` and `scheduleFromPickup` are domain/shipping/rules.ts now, and
// their tests moved with them (ruling 31) - orders knows nothing about
// carriers, which is the whole point of the move.

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

// THE RETURN LABEL'S REQUEST left too (ruling 66): building a carrier's JSON
// is `providers/shipments/requests.ts`' job, so what an order still decides
// about a return is only that its metal goes back at all.

// -------------------- what a screen may offer
//
// These are the rules an admin drawer held in a `switch (order.status)` until
// the orders pass, and they are here rather than in a component test because
// "which buttons an order earns" is a business decision - the gate that stops
// a half-confirmed purchase being priced, and the one that stops a sale being
// marked in transit before a refiner has it.

// The facts both answers read. Named here rather than exported by rules.ts:
// it is one call's argument shape and no table stores it (rulings 57/60/61).
type Facts = Parameters<typeof rules.actionsFor>[0];

const facts = (over: Partial<Facts> = {}): Facts => ({
  direction: "purchase", status: "Received", order_sent: null, tracking_updated: null,
  hasAddress: true, hasTotal: true, items: [{ confirmed: true }],
  shipments: [], payoutMethod: null, ...over,
});

test("an order with no lines is not confirmed, which the drawer's every() called true", () => {
  assert.equal(rules.allLinesConfirmed([]), false);
  assert.equal(rules.allLinesConfirmed([{ confirmed: true }, { confirmed: false }]), false);
  assert.equal(rules.allLinesConfirmed([{ confirmed: true }]), true);
});

test("a purchase reaches Payment Processing only once every line is confirmed", () => {
  assert.deepEqual(rules.statusesFor(facts()), [
    "Payment Processing", "In Transit", "Cancelled",
  ]);
  assert.deepEqual(rules.statusesFor(facts({ items: [{ confirmed: false }] })), [
    "In Transit", "Cancelled",
  ]);
});

test("a sale reaches In Transit only once the refiner has it and it is tracked", () => {
  const preparing = { direction: "sale" as const, status: "Preparing" };
  assert.deepEqual(rules.statusesFor(facts({ ...preparing })), ["Pending"]);
  assert.deepEqual(
    rules.statusesFor(facts({ ...preparing, order_sent: true, tracking_updated: null })),
    ["Pending"]
  );
  assert.deepEqual(
    rules.statusesFor(facts({ ...preparing, order_sent: true, tracking_updated: true })),
    ["In Transit", "Pending"]
  );
});

test("crediting an account is a payout fact, not a status", () => {
  assert.equal(rules.actionsFor(facts({ payoutMethod: "DORADO_ACCOUNT" })).add_funds, true);
  assert.equal(rules.actionsFor(facts({ payoutMethod: "ACH" })).add_funds, false);
  assert.equal(
    rules.actionsFor(facts({ payoutMethod: "DORADO_ACCOUNT", hasTotal: false })).add_funds,
    false
  );
});

test("the direction decides which half of the action surface exists", () => {
  const bought = rules.actionsFor(facts());
  assert.equal(bought.finalize_pricing, true);
  assert.equal(bought.edit_lines, true);
  assert.equal(bought.send_to_refiner, false);

  const sold = rules.actionsFor(facts({ direction: "sale", status: "Preparing" }));
  assert.equal(sold.send_to_refiner, true);
  assert.equal(sold.finalize_pricing, false);
  assert.equal(sold.edit_lines, false);
  assert.equal(sold.cancel, false);
});

test("a label is offered only while the inbound parcel has none", () => {
  const unlabelled = [{ direction: "Inbound", tracking_number: null }];
  const labelled = [{ direction: "Inbound", tracking_number: "794..." }];
  assert.equal(rules.actionsFor(facts({ shipments: unlabelled })).buy_label, true);
  assert.equal(rules.actionsFor(facts({ shipments: labelled })).buy_label, false);
  assert.equal(rules.actionsFor(facts()).buy_label, false);
  // A return leg is not the one a purchase labels.
  assert.equal(
    rules.actionsFor(facts({ shipments: [{ direction: "Return", tracking_number: null }] }))
      .buy_label,
    false
  );
});

test("cancelling needs somewhere to send the metal back to", () => {
  assert.equal(rules.actionsFor(facts()).cancel, true);
  assert.equal(rules.actionsFor(facts({ hasAddress: false })).cancel, false);
  assert.equal(rules.actionsFor(facts({ direction: "sale", hasAddress: false })).send_to_refiner, false);
});

// THE TWO FIGURES THE DRAWERS MULTIPLIED THEMSELVES, and the second is where
// they disagreed: the purchase footer read a scrap line total as the whole lot
// and the sale footer multiplied every line by its quantity.
test("payable is the fine ounces the business pays for", () => {
  assert.equal(rules.payableOf({ content: 2, premium: 0.9 }), 1.8);
  assert.equal(rules.payableOf({ content: null, premium: 0.9 }), null);
  assert.equal(rules.payableOf({ content: 2, premium: null }), null);
});

test("a scrap line total is the whole lot; a bullion line total counts units", () => {
  assert.equal(rules.lineTotalOf({ price: 100, quantity: 3, bullion_id: null }), 100);
  assert.equal(rules.lineTotalOf({ price: 100, quantity: 3, bullion_id: "p" }), 300);
  assert.equal(rules.lineTotalOf({ price: 100, quantity: null, bullion_id: "p" }), 100);
  assert.equal(rules.lineTotalOf({ price: null, quantity: 3, bullion_id: "p" }), null);
});
