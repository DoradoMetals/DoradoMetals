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
import { refusedField as orderField } from "#domain/orders/patch.ts";
import { refusedField as itemField } from "#domain/orders/edit-line.ts";
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

// The API typed these `boolean` while its own runtime had always refused
// anything but `true`. The contract says `true`; the refusal still names the
// field rather than talking about literals.
test("the operation names are true-or-omitted, not booleans", () => {
  assert.match(refusalOf(orderField("purchase", { finalize_pricing: false }), "finalize_pricing: false"), /finalize_pricing/);
  assert.match(refusalOf(orderField("purchase", { add_funds: false }), "add_funds: false"), /add_funds/);
  assert.equal(orderField("purchase", { finalize_pricing: true, add_funds: true }), null);
});

// `confirmed: false` matched no branch in the dispatch and answered 200 having
// written nothing. A no-op that reports success is worse than a refusal, and
// `reset: true` is how a line is unconfirmed.
test("an order item PATCH refuses confirmed: false rather than doing nothing", () => {
  assert.match(refusalOf(itemField({ confirmed: false }), "confirmed: false"), /confirmed/);
  assert.equal(itemField({ confirmed: true }), null);
  assert.equal(itemField({ reset: true }), null);
});

// THE PARTIAL THAT NULLS. updateBullion's statement is
// `SET quantity = $1, premium = $2` unconditionally, so a document naming only
// `premium` sent `undefined` for quantity and pg wrote NULL - a bullion line
// silently losing how many coins the customer sent. Both members are required
// now and the refusal names the missing one.
test("an order item PATCH refuses a partial bullion edit, which used to null the other column", () => {
  assert.match(refusalOf(itemField({ bullion: { premium: 1.02 } }), "a partial bullion edit"), /quantity/);
  assert.match(refusalOf(itemField({ bullion: { quantity: 2 } }), "a partial bullion edit"), /premium/);
  assert.equal(itemField({ bullion: { quantity: 2, premium: 1.02 } }), null);
  // Nullable, both of them - the columns are, and clearing a premium is real.
  assert.equal(itemField({ bullion: { quantity: null, premium: null } }), null);
});

// The same argument on the scrap side: updateScrapItem writes every column it
// knows, so the document must carry the whole scrap object and the line's
// premium, which is what the frontend has always sent.
test("an order item PATCH refuses a scrap edit that omits the premium it rewrites", () => {
  assert.match(
    refusalOf(itemField({ scrap: { scrap: { pre_melt: 3 } } }), "a scrap edit with no premium"),
    /premium/
  );
  assert.equal(itemField({ scrap: { premium: 0.9, scrap: { pre_melt: 3 } } }), null);
  assert.equal(itemField({ scrap: { premium: null, scrap: {} } }), null);
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
  assert.match(refusalOf(orderField("purchase", { nope: 1 }), "order"), /"nope"/);
  assert.match(refusalOf(itemField({ nope: 1 }), "order item"), /"nope"/);
  assert.match(refusalOf(shipmentField({ nope: 1 }), "shipment"), /"nope"/);
  assert.match(refusalOf(refinerOrderField({ nope: 1 }), "refiner order"), /"nope"/);
  assert.match(refusalOf(refinerItemField({ nope: 1 }), "refiner item"), /"nope"/);
  assert.match(refusalOf(payoutField({ nope: 1 }), "payout"), /"nope"/);

  // And the one bespoke unknown-field message survived the move: `content` is
  // derived, and saying so is worth more than "not a field".
  assert.match(refusalOf(refinerItemField({ content: 1 }), "content"), /derived/);
});
