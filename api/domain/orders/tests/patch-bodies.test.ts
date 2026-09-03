// THE SIX PATCH BODIES, AND THE NULL DECISION THEY FORCED (phase 3, A3).
//
// `OrderPatch`, `OrderItemPatch`, `ShipmentPatch`, `RefinerOrderPatch`,
// `PayoutPatch` and `RefinerItemPatch` were each declared TWICE - once in
// api/features, once in frontend/features - with no contract between them, and
// four had drifted. Two of those drifts were defects rather than untidiness:
// the API's types accepted `null` to CLEAR five values, and the frontend's own
// types made sending that null a compile error. So either the clear was
// unreachable, or the API was accepting a null it should refuse.
//
// THIS FILE IS WHERE THAT DECISION IS CHECKABLE. Each body now has one
// definition in @dorado/contracts and both sides import it; what a test can
// still get wrong is the RUNTIME half - whether the service actually refuses
// what the contract says it refuses - because a type does not stop a JSON body.
//
// The decision, field by field, and why it is not one rule applied five times:
//
//   shipping_charge     null REFUSED. editShippingCharge takes `number`; the
//                       patch service reached it through `as number`. Every
//                       reader is `?? 0`, so a cleared charge and a zero one
//                       price identically - "free" is 0, and a stored fee is a
//                       record (D117).
//   pool_oz_deducted    null REFUSED, same argument: their exchange shadows
//   pool_remediation    are each typed `number` and were reached by cast.
//   fee
//   refiner_id          null KEPT. A nullable foreign key, not a fee. Every
//                       engagement starts null (ensureForOrder inserts
//                       `(order_id)` alone), detaching one is a real
//                       operation, and setEngagementValue already admits null.
//                       Here the FRONTEND was the side that was wrong.
//
// And the control, which is what stops the above from reading as a rule about
// nulls: RefinerItemPatch's five fields are ALL nullable and stay that way,
// because the admin drawer really sends those nulls and the service really
// merges them as "not measured".
//
// PURE - refusedField is a function of the document. Nothing here touches the
// database, but importing the services opens the pool, so it is closed at the
// end.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import { OrderItemPatch, OrderPatch } from "@dorado/contracts";
import { refusedField as shipmentField } from "#transport/shipping/shipments/controller.ts";
import { refusedField as refinerOrderField } from "#transport/refiners/orders/controller.ts";
import { refusedField as refinerItemField } from "#transport/refiners/items/controller.ts";
import { refusedField as payoutField } from "#domain/payouts/service.ts";

after(async () => {
  await pool.end();
});

// Names the refusal rather than dereferencing a possible null, the same guard
// patch.test.ts uses.
const refusalOf = (
  refusal: { statusCode: number; message: string } | null,
  what: string
): string => {
  assert.ok(refusal, `${what} was accepted`);
  assert.equal(refusal.statusCode, 400, `${what} was not a 400`);
  return refusal.message;
};

// --------------------------------------------------- the four nulls refused

test("a shipment PATCH refuses a null shipping charge, by name", () => {
  assert.match(
    refusalOf(shipmentField({ shipping_charge: null }), "shipping_charge: null"),
    /shipping_charge/
  );
  // The value it replaced is still accepted, zero included - the decision was
  // "there is no third state", not "no clearing-shaped number".
  assert.equal(shipmentField({ shipping_charge: 0 }), null);
  assert.equal(shipmentField({ shipping_charge: 45.67 }), null);
});

test("a refiner order PATCH refuses a null on each of the three money fields", () => {
  for (const field of ["pool_oz_deducted", "pool_remediation", "fee"]) {
    assert.match(
      refusalOf(refinerOrderField({ [field]: null }), `${field}: null`),
      new RegExp(field)
    );
    assert.equal(refinerOrderField({ [field]: 0 }), null, `${field}: 0 was refused`);
  }
});

// ------------------------------------------------------- the one null kept

test("a refiner order PATCH ACCEPTS a null refiner_id - detaching is an operation", () => {
  assert.equal(
    refinerOrderField({ refiner_id: null }),
    null,
    "clearing the engagement's refinery was refused"
  );
  assert.equal(
    refinerOrderField({ refiner_id: "00000000-0000-4000-8000-000000000000" }),
    null
  );
});

// The control. If the four above had been decided by a rule about nulls rather
// than on their own facts, these would have gone with them - and the assay
// drawer would have lost the only way it has to say "not measured".
test("a refiner item PATCH keeps every one of its nulls", () => {
  for (const field of ["premium", "pre_melt", "post_melt", "purity"]) {
    assert.equal(refinerItemField({ [field]: null }), null, `${field}: null was refused`);
  }
  assert.equal(refinerItemField({ unit: null }), null);
});

// ------------------------------------------- what the contract now also says

// THE ORDER'S AND THE LINE'S BODIES ARE PARSED STRICTLY AT TRANSPORT (D214
// item 11), so neither has a `refusedField` any more - the contract IS the
// check, and these assert it directly.
const refusesField = (
  schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } } },
  body: unknown,
  named: string
) => {
  const parsed = schema.safeParse(body);
  assert.equal(parsed.success, false, `${named} was accepted`);
  const said = (parsed.error?.issues ?? [])
    .map((i) => `${i.path.join(".")} ${i.message}`)
    .join(" | ");
  assert.match(said, new RegExp(named), `the refusal does not name ${named}`);
};

// THE FOUR ACTIONS LEFT THIS BODY. add_funds, finalize_pricing, cancel and
// supplier were operations multiplexed through a PATCH; each is a POST of its
// own now, so naming one here is naming a field the endpoint does not have.
test("the order PATCH is the row's own columns, and the four actions are not among them", () => {
  assert.equal(OrderPatch.safeParse({ status: "Received" }).success, true);
  assert.equal(OrderPatch.safeParse({ notes: "left on the porch" }).success, true);
  // Both columns are nullable, so an explicit null CLEARS.
  assert.equal(OrderPatch.safeParse({ notes: null }).success, true);
  for (const action of ["add_funds", "finalize_pricing", "cancel", "supplier"]) {
    refusesField(OrderPatch, { [action]: true }, action);
  }
});

// `confirmed` IS A COLUMN, NOT AN OPERATION. It was a `true`-only literal with
// a second name (`reset: true`) for the other direction, because the dispatch
// was `body.confirmed === true || body.reset === true` and `confirmed: false`
// matched no branch. One flat patch of the row makes both directions the same
// write, so `false` is legal and `reset` is not a field at all.
test("an order item PATCH takes confirmed both ways, and has no `reset`", () => {
  assert.equal(OrderItemPatch.safeParse({ confirmed: true }).success, true);
  assert.equal(OrderItemPatch.safeParse({ confirmed: false }).success, true);
  refusesField(OrderItemPatch, { reset: true }, "reset");
});

// THE PARTIAL THAT NULLED. `SET quantity = $1, premium = $2` unconditionally
// meant a document naming only `premium` wrote NULL over the quantity - a
// bullion line silently losing how many coins the customer sent. The old
// contract defended it by REQUIRING both members; buildUpdate names only the
// keys the document carries, so a partial is safe and the requirement is gone.
test("an order item PATCH writes only what it names, so a partial is legal", () => {
  assert.equal(OrderItemPatch.safeParse({ premium: 1.02 }).success, true);
  assert.equal(OrderItemPatch.safeParse({ quantity: 2 }).success, true);
  assert.equal(OrderItemPatch.safeParse({ quantity: 2, premium: 1.02 }).success, true);
  // Nullable, both of them - the columns are, and clearing a premium is real.
  assert.equal(OrderItemPatch.safeParse({ quantity: null, premium: null }).success, true);
});

// ONE ROW, ONE PATCH. `{scrap: {premium, scrap: {...}}}` was the admin
// drawer's document for ONE table, read through casts; the line's own columns
// are the body now, and the nested spellings are not fields.
test("an order item PATCH is flat - the scrap and bullion documents are gone", () => {
  assert.equal(
    OrderItemPatch.safeParse({ pre_melt: 3, post_melt: 2.8, purity: 0.585, unit: "g" }).success,
    true
  );
  refusesField(OrderItemPatch, { scrap: { premium: 0.9, scrap: { pre_melt: 3 } } }, "scrap");
  refusesField(OrderItemPatch, { bullion: { quantity: 2, premium: 1.02 } }, "bullion");
  // `content` is DERIVED from the weight, the unit and the purity, and the
  // refiner's assay numbers are refiners.items - neither is a field here.
  refusesField(OrderItemPatch, { content: 4 }, "content");
  refusesField(OrderItemPatch, { purity_actual: 0.5 }, "purity_actual");
});

// ------------------------------------------------------------- the new field

// The waive flag is a boolean and only a boolean: it is not an operation name
// like finalize_pricing, because un-waiving is as real as waiving.
test("a payout PATCH takes the waive flag both ways, and refuses a non-boolean", () => {
  assert.equal(payoutField({ waive_payout_fee: true }), null);
  assert.equal(payoutField({ waive_payout_fee: false }), null);
  assert.match(
    refusalOf(payoutField({ waive_payout_fee: "yes" }), "waive_payout_fee: 'yes'"),
    /waive_payout_fee/
  );
  // And the fee itself is still per-order data, which is the half of
  // production a boolean cannot express: two ECHECK rows are stored ABOVE the
  // method's default fee, not below it.
  assert.equal(payoutField({ cost: 125 }), null);
});

// ------------------------------------------------- unknown fields still lead

// THE ORDER OF THE TWO CHECKS IS LOAD-BEARING. zod strips unknown keys rather
// than rejecting them, so a document parsed first would turn a typo'd field
// into a silent 200 that wrote nothing - the admin-mutation-urls bug. Every
// one of the six refuses by name BEFORE the contract sees the body.
test("an unknown field is refused by name on every one of the six", () => {
  refusesField(OrderPatch, { nope: 1 }, "nope");
  refusesField(OrderItemPatch, { nope: 1 }, "nope");
  assert.match(refusalOf(shipmentField({ nope: 1 }), "shipment"), /"nope"/);
  assert.match(refusalOf(refinerOrderField({ nope: 1 }), "refiner order"), /"nope"/);
  assert.match(refusalOf(refinerItemField({ nope: 1 }), "refiner item"), /"nope"/);
  assert.match(refusalOf(payoutField({ nope: 1 }), "payout"), /"nope"/);

  // And the one bespoke unknown-field message survived the move: `content` is
  // derived, and saying so is worth more than "not a field".
  assert.match(refusalOf(refinerItemField({ content: 1 }), "content"), /derived/);
});
