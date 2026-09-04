// THE STEPPER'S RULES, WITHOUT POSTGRES.
//
// These are the expressions the browser used to hold: "is the shipping step
// complete", "can the carrier be asked for rates", "may this be placed". They
// are pure now, so they are tested as arithmetic - and a rule that only ever
// ran behind a live checkout row is a rule nobody could see change.
import { test } from "vitest";
import assert from "node:assert/strict";
import type { Checkout } from "@dorado/contracts";
import { addressColumnFor, checkoutState, handoffFor, methodTypeFor } from "#domain/checkout/rules.ts";

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
  item_count: number; requires_schedule: boolean; has_fulfillment: boolean;
}> = {}) =>
  checkoutState({
    row: row(over), direction: "purchase",
    item_count: extra.item_count ?? 1,
    requires_schedule: extra.requires_schedule ?? false,
    has_fulfillment: extra.has_fulfillment ?? false,
  });

test("an empty purchase checkout is missing every step, in stepper order", () => {
  const state = purchase({}, { item_count: 0 });
  assert.deepEqual(state.missing, [
    "items", "shipper_address", "package", "handoff", "carrier_service", "payout_account",
  ]);
  assert.equal(state.ready_for_rates, false);
  assert.equal(state.ready_for_payment, false);
  assert.equal(state.ready_to_place, false);
});

// The carrier is asked what a parcel costs, so it needs the parcel: lines to
// weigh, a box to weigh them in, somewhere to collect from. Exactly the three
// refusals shipping/operations' getCheckoutRates raises, and nothing more -
// a service is what the call is FOR.
test("rates need items, a box and an address, and nothing else", () => {
  assert.equal(purchase({ shipper_address_id: "a" }).ready_for_rates, false);
  assert.equal(purchase({ package_id: "p" }).ready_for_rates, false);
  assert.equal(
    purchase({ shipper_address_id: "a", package_id: "p" }, { item_count: 0 }).ready_for_rates,
    false
  );
  assert.equal(purchase({ shipper_address_id: "a", package_id: "p" }).ready_for_rates, true);
});

const shipped = {
  shipper_address_id: "a", package_id: "p", carrier_service_id: "s",
};

test("the shipping step completes when only the payout account is left", () => {
  const state = purchase(shipped, { has_fulfillment: true });
  assert.deepEqual(state.missing, ["payout_account"]);
  assert.equal(state.ready_for_payment, true);
  assert.equal(state.ready_to_place, false);
});

// A carrier PICKUP is the schedulable handoff, and a schedule half-made is no
// schedule: a date with no time books nothing.
test("a schedulable handoff owes a date AND a time", () => {
  const noSchedule = purchase(shipped, { has_fulfillment: true, requires_schedule: true });
  assert.ok(noSchedule.missing.includes("pickup_schedule"));
  assert.equal(noSchedule.ready_for_payment, false);

  const dateOnly = purchase(
    { ...shipped, pickup_date: "2026-09-10" },
    { has_fulfillment: true, requires_schedule: true }
  );
  assert.ok(dateOnly.missing.includes("pickup_schedule"));

  const both = purchase(
    { ...shipped, pickup_date: "2026-09-10", pickup_time: "10:00" },
    { has_fulfillment: true, requires_schedule: true }
  );
  assert.deepEqual(both.missing, ["payout_account"]);
});

test("a purchase is placeable only once the payout account is sealed", () => {
  const state = purchase(
    { ...shipped, payment_details_id: "d" }, { has_fulfillment: true }
  );
  assert.deepEqual(state.missing, []);
  assert.equal(state.ready_to_place, true);
});

// The sale has no parcel of the customer's and no payout: an address, a
// service and a way to pay.
test("a sale asks for a recipient address, a service and a payment method", () => {
  const empty = checkoutState({
    row: row({ direction: "sale" }), direction: "sale",
    item_count: 1, requires_schedule: false, has_fulfillment: false,
  });
  assert.deepEqual(empty.missing, ["recipient_address", "carrier_service", "payment_method"]);

  const ready = checkoutState({
    row: row({
      direction: "sale", recipient_address_id: "a",
      carrier_service_id: "s", payment_method_id: "m",
    }),
    direction: "sale", item_count: 1, requires_schedule: false, has_fulfillment: false,
  });
  assert.deepEqual(ready.missing, []);
  assert.equal(ready.ready_for_payment, true);
  assert.equal(ready.ready_to_place, true);
});

test("a sale with only the card outstanding is still ready for payment", () => {
  const state = checkoutState({
    row: row({ direction: "sale", recipient_address_id: "a", carrier_service_id: "s" }),
    direction: "sale", item_count: 1, requires_schedule: false, has_fulfillment: false,
  });
  assert.deepEqual(state.missing, ["payment_method"]);
  assert.equal(state.ready_for_payment, true);
  assert.equal(state.ready_to_place, false);
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
