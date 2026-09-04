// THE STEPPER'S RULES, WITHOUT POSTGRES.
//
// These are the expressions the browser used to hold: "is the shipping step
// complete", "can the carrier be asked for rates", "may this be placed". They
// are pure now, so they are tested as arithmetic - and a rule that only ever
// ran behind a live checkout row is a rule nobody could see change.
//
// CheckoutView SHRANK (Jacob, 2026-09-04): `ready_for_rates`,
// `ready_for_payment`, `ready_to_place`, `item_count`,
// `fulfillment_method_type` and `handoff_code` are all gone - each was a
// second reading of `missing` itself, and a stepper can derive every one of
// them off the one list (empty means placeable, "shipper_address"/"package"
// absent means rates can be asked for). `checkoutState` answers `{ missing }`
// alone now, and it is CATEGORY-AWARE: a PICKUP or DIRECT draft is never
// asked for a shipper address or a box.
import { test } from "vitest";
import assert from "node:assert/strict";
import type { Checkout, FulfillmentCategory } from "@dorado/contracts";
import {
  addressColumnFor, checkoutState, handoffFor, methodTypeFor,
  CHOICE_COLUMNS, mergeChoices,
} from "#domain/checkout/rules.ts";

const row = (over: Partial<Checkout> = {}): Checkout =>
  ({
    id: "c", user_id: "u", direction: "purchase",
    payment_method_id: null, payment_details_id: null, fulfillment_method_id: null,
    appointment_location_id: null, pickup_address_id: null, shipper_address_id: null,
    recipient_address_id: null, carrier_service_id: null, package_id: null,
    appointment_time: null, fulfillment_id: null, pickup_date: null, pickup_time: null,
    ...over,
  });

const purchase = (over: Partial<Checkout>, extra: Partial<{
  item_count: number; category: FulfillmentCategory | null; requires_schedule: boolean;
}> = {}) =>
  checkoutState({
    row: row(over), direction: "purchase",
    item_count: extra.item_count ?? 1,
    category: extra.category ?? null,
    requires_schedule: extra.requires_schedule ?? false,
  });

test("until a method is chosen, the category-specific steps do not apply yet", () => {
  assert.deepEqual(
    purchase({}, { item_count: 0 }).missing,
    ["items", "fulfillment_method", "payout_account"]
  );
  assert.deepEqual(purchase({}).missing, ["fulfillment_method", "payout_account"]);
  assert.deepEqual(
    purchase({ payment_details_id: "d" }).missing, ["fulfillment_method"]
  );
});

// A parcel needs a box and somewhere to collect from, and nothing a PICKUP or
// DIRECT draft would ever carry - the CATEGORY REFUSAL that used to gate this
// is gone (Jacob, 2026-09-04: "If it's a direct or pickup, why would it need
// shipper_address_id or package_id?").
test("a SHIPMENT checkout owes an address, a box and a service", () => {
  assert.deepEqual(
    purchase({}, { category: "SHIPMENT" }).missing,
    ["shipper_address", "package", "carrier_service", "payout_account"]
  );
  assert.deepEqual(
    purchase({ shipper_address_id: "a" }, { category: "SHIPMENT" }).missing,
    ["package", "carrier_service", "payout_account"]
  );
  assert.deepEqual(
    purchase({ shipper_address_id: "a", package_id: "p" }, { category: "SHIPMENT" }).missing,
    ["carrier_service", "payout_account"]
  );
});

const shipped = {
  shipper_address_id: "a", package_id: "p", carrier_service_id: "s",
};

test("the SHIPMENT step completes when only the payout account is left", () => {
  const state = purchase(shipped, { category: "SHIPMENT" });
  assert.deepEqual(state.missing, ["payout_account"]);
});

// A carrier PICKUP is the schedulable handoff, and a schedule half-made is no
// schedule: a date with no time books nothing.
test("a schedulable handoff owes a date AND a time", () => {
  const noSchedule = purchase(shipped, { category: "SHIPMENT", requires_schedule: true });
  assert.ok(noSchedule.missing.includes("pickup_schedule"));

  const dateOnly = purchase(
    { ...shipped, pickup_date: "2026-09-10" },
    { category: "SHIPMENT", requires_schedule: true }
  );
  assert.ok(dateOnly.missing.includes("pickup_schedule"));

  const both = purchase(
    { ...shipped, pickup_date: "2026-09-10", pickup_time: "10:00" },
    { category: "SHIPMENT", requires_schedule: true }
  );
  assert.deepEqual(both.missing, ["payout_account"]);
});

test("a SHIPMENT purchase is placeable only once the payout account is sealed", () => {
  const state = purchase(
    { ...shipped, payment_details_id: "d" }, { category: "SHIPMENT" }
  );
  assert.deepEqual(state.missing, []);
});

// PICKUP - Dorado collects from the customer's own address.
test("a PICKUP checkout owes its own address and an appointment time", () => {
  assert.deepEqual(
    purchase({}, { category: "PICKUP" }).missing,
    ["pickup_address", "appointment_time", "payout_account"]
  );
  assert.deepEqual(
    purchase(
      { pickup_address_id: "pa", appointment_time: "2026-09-10T15:00:00Z", payment_details_id: "d" },
      { category: "PICKUP" }
    ).missing,
    []
  );
});

// DIRECT - the customer walks in.
test("a DIRECT checkout owes a location and an appointment time", () => {
  assert.deepEqual(
    purchase({}, { category: "DIRECT" }).missing,
    ["appointment_location", "appointment_time", "payout_account"]
  );
  assert.deepEqual(
    purchase(
      { appointment_location_id: "l", appointment_time: "2026-09-10T15:00:00Z", payment_details_id: "d" },
      { category: "DIRECT" }
    ).missing,
    []
  );
});

// The sale has no parcel of the customer's, no method to choose and no payout:
// only its items and where the metal is delivered. `carrier_service` and
// `payment_method` used to be on this list too - CheckoutView's shrink
// dropped them, along with the ready_for_payment/ready_to_place booleans that
// read them.
test("a sale asks only for its items and a recipient address", () => {
  const empty = checkoutState({
    row: row({ direction: "sale" }), direction: "sale",
    item_count: 0, category: null, requires_schedule: false,
  });
  assert.deepEqual(empty.missing, ["items", "recipient_address"]);

  const ready = checkoutState({
    row: row({ direction: "sale", recipient_address_id: "a" }),
    direction: "sale", item_count: 1, category: null, requires_schedule: false,
  });
  assert.deepEqual(ready.missing, []);
});

test("a parcel leaves the customer on a purchase and arrives on a sale", () => {
  assert.equal(addressColumnFor("purchase"), "shipper_address_id");
  assert.equal(addressColumnFor("sale"), "recipient_address_id");
});

// The two vocabularies meet in one place, and they meet in BOTH directions -
// the choice writes a method type and the read-back resolves the handoff, so
// a change to either has to be a change to methodTypeFor.
test("a handoff and its fulfillment method round-trip", () => {
  const dropoff = {
    code: "DROP", name: "Drop off", requires_schedule: false,
    has_dropoff_locations: true, display_order: 0,
  };
  const collect = {
    code: "COLLECT", name: "Collection", requires_schedule: true,
    has_dropoff_locations: false, display_order: 1,
  };
  assert.equal(methodTypeFor(dropoff), "CARRIER DROPOFF");
  assert.equal(methodTypeFor(collect), "CARRIER PICKUP");
  assert.equal(handoffFor([dropoff, collect], "CARRIER PICKUP")?.code, "COLLECT");
  assert.equal(handoffFor([dropoff, collect], "CARRIER DROPOFF")?.code, "DROP");
  assert.equal(handoffFor([dropoff, collect], null), null);
  // A method that is not a carrier handoff at all - PICKUP, APPOINTMENT -
  // resolves to no handoff rather than to the first one in the list.
  assert.equal(handoffFor([dropoff, collect], "APPOINTMENT"), null);
});

// ------------------------------------------- the merge a sign-in performs

// Ruling 63: a visitor's choices win where they made one, the customer's saved
// answers survive where the visitor has none. The patch is what gets applied to
// the row that SURVIVES, which is the customer's.

test("the visitor's choices win where the visitor made one", () => {
  const patch = mergeChoices(
    { package_id: "visitor-box", carrier_service_id: "visitor-service" },
    { package_id: "saved-box", carrier_service_id: null }
  );
  assert.equal(patch.package_id, "visitor-box");
  assert.equal(patch.carrier_service_id, "visitor-service");
});

test("the customer's saved answer survives where the visitor has none", () => {
  const patch = mergeChoices(
    { package_id: null, shipper_address_id: "visitor-address" },
    { package_id: "saved-box", shipper_address_id: null }
  );
  // Not named at all: it already holds the winning value, and a merge that
  // rewrote every column would make signing in look like a full row update.
  assert.ok(!("package_id" in patch), "an unchanged column is not in the patch");
  assert.equal(patch.shipper_address_id, "visitor-address");
});

test("a merge with nothing to say writes nothing", () => {
  assert.deepEqual(mergeChoices({}, {}), {});
  assert.deepEqual(mergeChoices({ package_id: "same" }, { package_id: "same" }), {});
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
