// THE CHECKOUT'S OWN RULES, WITHOUT POSTGRES.
//
// These are the expressions the browser used to hold: "is the shipping step
// complete", "may this be placed". They are pure now, so they are tested as
// arithmetic - and a rule that only ever ran behind a live checkout row is a
// rule nobody could see change.
//
// THE LIST SHRANK TO FOUR (rulings 69/70, Jacob 2026-09-04: "The only thing
// that should be deciding if fulfillments is 'ready' is fulfillments").
// `checkoutState` used to branch on the chosen method's CATEGORY and read eight
// handover columns off the row. Those columns are the draft fulfillment's now
// (migration 128) and the SHIPMENT/PICKUP/DIRECT cases moved with them, to
// domain/fulfillments/tests/missing.test.ts. What arrives here is an opaque
// `handover` list this file only ever splices - which is the whole point.
import { test } from "vitest";
import assert from "node:assert/strict";
import type { Checkout, FulfillmentStep } from "@dorado/contracts";
import { checkoutState, CHOICE_COLUMNS, mergeChoices } from "#domain/checkout/rules.ts";

const row = (over: Partial<Checkout> = {}): Checkout =>
  ({
    id: "c", user_id: "u", direction: "purchase",
    payment_method_id: null, payment_details_id: null,
    recipient_address_id: null, fulfillment_id: null,
    ...over,
  });

const purchase = (over: Partial<Checkout>, extra: Partial<{
  item_count: number; handover: FulfillmentStep[];
}> = {}) =>
  checkoutState({
    row: row(over), direction: "purchase",
    item_count: extra.item_count ?? 1,
    handover: extra.handover ?? [],
  });

test("with no draft fulfillment, nobody can say how the order is handed over", () => {
  assert.deepEqual(
    purchase({}, { item_count: 0 }).missing,
    ["items", "fulfillment_id", "payment_details_id"]
  );
  assert.deepEqual(purchase({}).missing, ["fulfillment_id", "payment_details_id"]);
  assert.deepEqual(
    purchase({ payment_details_id: "d" }).missing, ["fulfillment_id"]
  );
});

// THE SPLICE, AND NOTHING ELSE. checkout does not know what a
// `shipper_address_id` is; it puts the fulfillment's answer where the customer
// would work through it and moves on to the money.
test("the fulfillment's own list is spliced in, verbatim and in order", () => {
  assert.deepEqual(
    purchase(
      { fulfillment_id: "f" },
      { handover: ["shipper_address_id", "package_id", "carrier_service_id"] }
    ).missing,
    ["shipper_address_id", "package_id", "carrier_service_id", "payment_details_id"]
  );
});

// A draft with nothing outstanding is what makes the whole list empty, and an
// empty list is exactly what `place` accepts.
test("a purchase is placeable once the draft and the payout account are done", () => {
  assert.deepEqual(
    purchase({ fulfillment_id: "f", payment_details_id: "d" }).missing, []
  );
});

// The handover list is IGNORED while there is no draft - it would be empty
// anyway, and naming a step for a fulfillment that does not exist tells the
// customer to do something they cannot.
test("no draft means no handover steps, whatever is passed", () => {
  assert.deepEqual(
    purchase({ payment_details_id: "d" }, { handover: ["package_id"] }).missing,
    ["fulfillment_id"]
  );
});

// The sale owes its items, a draft and somewhere to deliver - never a payout
// account, which is the purchase's half of the money step.
test("a sale asks for its items, a draft and a recipient address", () => {
  const empty = checkoutState({
    row: row({ direction: "sale" }), direction: "sale", item_count: 0, handover: [],
  });
  assert.deepEqual(empty.missing, ["items", "fulfillment_id", "recipient_address_id"]);

  const ready = checkoutState({
    row: row({ direction: "sale", recipient_address_id: "a", fulfillment_id: "f" }),
    direction: "sale", item_count: 1, handover: [],
  });
  assert.deepEqual(ready.missing, []);
});

// ------------------------------------------- the merge a sign-in performs

// Ruling 63: a visitor's choices win where they made one, the customer's saved
// answers survive where the visitor has none. The patch is what gets applied to
// the row that SURVIVES, which is the customer's.

test("the visitor's choices win where the visitor made one", () => {
  const patch = mergeChoices(
    { recipient_address_id: "visitor-address", payment_method_id: "visitor-method" },
    { recipient_address_id: "saved-address", payment_method_id: null }
  );
  assert.equal(patch.recipient_address_id, "visitor-address");
  assert.equal(patch.payment_method_id, "visitor-method");
});

test("the customer's saved answer survives where the visitor has none", () => {
  const patch = mergeChoices(
    { payment_method_id: null, recipient_address_id: "visitor-address" },
    { payment_method_id: "saved-method", recipient_address_id: null }
  );
  // Not named at all: it already holds the winning value, and a merge that
  // rewrote every column would make signing in look like a full row update.
  assert.ok(!("payment_method_id" in patch), "an unchanged column is not in the patch");
  assert.equal(patch.recipient_address_id, "visitor-address");
});

test("a merge with nothing to say writes nothing", () => {
  assert.deepEqual(mergeChoices({}, {}), {});
  assert.deepEqual(
    mergeChoices({ payment_method_id: "same" }, { payment_method_id: "same" }), {}
  );
});

test("a visitor who chose nothing cannot blank a saved choice", () => {
  // The failure this pins: `anonymous[column] ?? real[column]` written as
  // `anonymous[column]` would clear every answer the customer had saved, and
  // the symptom - a checkout that resets itself on sign-in - reads like a bug
  // in the stepper rather than in the merge.
  const saved = Object.fromEntries(CHOICE_COLUMNS.map((c) => [c, `saved-${c}`]));
  assert.deepEqual(mergeChoices({}, saved), {});
});

test("every column a step writes is in the merge's subject", () => {
  // The list is `checkouts.PATCHABLE` restated (rules.ts says why it is not
  // imported). tests/adopt.test.ts pins the two equal against the repo; this
  // half pins the shape, so a typo in one entry fails without a database.
  assert.equal(new Set(CHOICE_COLUMNS).size, CHOICE_COLUMNS.length, "no duplicates");
  for (const column of CHOICE_COLUMNS) {
    assert.ok(column in row(), `${column} is a column of the checkout row`);
  }
});
