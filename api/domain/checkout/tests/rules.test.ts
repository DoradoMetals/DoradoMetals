import { test } from "vitest";
import assert from "node:assert/strict";
import type { Checkout, CheckoutViewFacts, FulfillmentStep } from "@dorado/contracts";
import { checkoutState, CHOICE_COLUMNS, mergeChoices } from "#domain/checkout/rules.ts";

const row = (over: Partial<Checkout> = {}): Checkout =>
  ({
    id: "c", user_id: "u", direction: "purchase",
    payment_method_id: null, payment_details_id: null,
    recipient_address_id: null, fulfillment_id: null,
    ...over,
  });

const view = (over: Partial<Checkout>, items: number): CheckoutViewFacts => ({
  ...row(over),
  items: Array.from({ length: items }, () => ({}) as CheckoutViewFacts["items"][number]),
});

const purchase = (over: Partial<Checkout>, extra: Partial<{
  item_count: number; handover: FulfillmentStep[];
}> = {}) =>
  checkoutState(view(over, extra.item_count ?? 1), extra.handover ?? []);

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

test("the fulfillment's own list is spliced in, verbatim and in order", () => {
  assert.deepEqual(
    purchase(
      { fulfillment_id: "f" },
      { handover: ["shipper_address_id", "package_id", "carrier_service_id"] }
    ).missing,
    ["shipper_address_id", "package_id", "carrier_service_id", "payment_details_id"]
  );
});

test("a purchase is placeable once the draft and the payout account are done", () => {
  assert.deepEqual(
    purchase({ fulfillment_id: "f", payment_details_id: "d" }).missing, []
  );
});

test("no draft means no handover steps, whatever is passed", () => {
  assert.deepEqual(
    purchase({ payment_details_id: "d" }, { handover: ["package_id"] }).missing,
    ["fulfillment_id"]
  );
});

test("a sale asks for its items, a draft and a recipient address", () => {
  const empty = checkoutState(view({ direction: "sale" }, 0), []);
  assert.deepEqual(empty.missing, ["items", "fulfillment_id", "recipient_address_id"]);

  const ready = checkoutState(
    view({ direction: "sale", recipient_address_id: "a", fulfillment_id: "f" }, 1), []
  );
  assert.deepEqual(ready.missing, []);
});

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
  const saved = Object.fromEntries(CHOICE_COLUMNS.map((c) => [c, `saved-${c}`]));
  assert.deepEqual(mergeChoices({}, saved), {});
});

test("every column a step writes is in the merge's subject", () => {
  assert.equal(new Set(CHOICE_COLUMNS).size, CHOICE_COLUMNS.length, "no duplicates");
  for (const column of CHOICE_COLUMNS) {
    assert.ok(column in row(), `${column} is a column of the checkout row`);
  }
});
