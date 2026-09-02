// The carrier catalogue: the values that used to live in the browser.
//
// Two of them are load-bearing beyond display and the tests below say so,
// because a later reader tidying a string here would change what a shipment row
// records and what a packing list prints - neither of which the string looks
// like it does.
import test from "node:test";
import assert from "node:assert/strict";

import { CATALOGUE } from "#features/shipping/operations/adapters/fedex.catalogue.ts";
import { CATALOGUES } from "#features/shipping/operations/catalogues.ts";
import { PROVIDERS } from "#features/shipping/operations/registry.ts";
import { BUILDERS } from "#features/shipping/operations/builders.ts";

test("every carrier with a provider has builders and a catalogue", () => {
  // resolveCarrier looks all three up with one key and throws if any is
  // missing, so a carrier registered in one map and forgotten in another is a
  // failure at the first rate quote rather than at startup. This is the check
  // that keeps them in step.
  for (const key of Object.keys(PROVIDERS)) {
    assert.ok(key in BUILDERS, `${key} has a provider but no builders`);
    assert.ok(key in CATALOGUES, `${key} has a provider but no catalogue`);
  }
});

test("handoff names are the values written to shipments.pickup_type", () => {
  // The create body sends pickup.name and it lands in the column verbatim.
  // Production holds 62 rows reading exactly 'Store Dropoff', and
  // features/media/pdfs compares against that string in two places to decide
  // whether a packing list prints dropoff instructions. Changing either name
  // changes stored data and printed documents.
  const names = CATALOGUE.handoffs.map((h) => h.name);
  assert.deepEqual(names, ["Store Dropoff", "Carrier Pickup"]);
});

// *** THE CAPABILITY RULE THE ROW FLOW RESOLVES BY (D208). ***
//
// features/orders/create.ts picks the handoff for a label FROM the customer's
// fulfillment method by ONE flag: the schedulable handoff is the carrier
// pickup, the other is the dropoff. That resolution only means something while
// the catalogue offers exactly one of each - two schedulable options would
// make the pick a coin toss, and zero would refuse every pickup order.
// (The old pin here indexed intake.ts's name map; intake died with the
// composed create.)
test("the catalogue offers exactly one schedulable handoff and one that is not", () => {
  const schedulable = CATALOGUE.handoffs.filter((h) => h.requires_schedule);
  const walkUp = CATALOGUE.handoffs.filter((h) => !h.requires_schedule);
  assert.equal(schedulable.length, 1, "the pickup pick would be a coin toss");
  assert.equal(walkUp.length, 1, "the dropoff pick would be a coin toss");
});

test("the handoff that books a courier is the one that requires scheduling", () => {
  // features/orders/service.ts dispatches a courier on the literal
  // "Carrier Pickup", and it needs a date and a time to do it. The frontend
  // collects those only when `requires_schedule` is set, so the two must name
  // the same option - otherwise a courier is booked for an order that never
  // asked the customer when.
  const courier = CATALOGUE.handoffs.find((h) => h.name === "Carrier Pickup");
  assert.ok(courier, "the courier handoff is gone - features/orders/service.ts still books on it");
  assert.equal(courier.requires_schedule, true);
});

test("handoff codes are the values FedEx accepts as a pickupType", () => {
  // Round-tripped by the browser into the label request. The frontend does not
  // interpret them - that is the whole point of the read - but they are still
  // FedEx's enum on the way back out.
  const codes = CATALOGUE.handoffs.map((h) => h.code);
  assert.deepEqual(codes, ["DROPOFF_AT_FEDEX_LOCATION", "CONTACT_FEDEX_TO_SCHEDULE"]);
});

test("exactly one handoff is scheduled and exactly one has dropoff locations", () => {
  // The frontend branches on these two booleans instead of on the codes above.
  // If both were false the checkout would offer a handoff with no way to finish
  // it, and nothing else would notice.
  assert.equal(CATALOGUE.handoffs.filter((h) => h.requires_schedule).length, 1);
  assert.equal(CATALOGUE.handoffs.filter((h) => h.has_dropoff_locations).length, 1);
});

test("a handoff schedules or has dropoff locations, never both and never neither", () => {
  for (const h of CATALOGUE.handoffs) {
    assert.notEqual(
      h.requires_schedule,
      h.has_dropoff_locations,
      `${h.code} must do exactly one of the two`
    );
  }
});

test("service codes are what a rate quote's serviceType matches", () => {
  const codes = CATALOGUE.services.map((s) => s.code);
  assert.deepEqual(codes, ["FEDEX_EXPRESS_SAVER", "PRIORITY_OVERNIGHT"]);
});

test("every offered service carries the carrier code a pickup check needs", () => {
  // FedEx wants the service FAMILY on a pickup-availability call - FDXE for
  // express, FDXG for ground - so it is a property of the service and not of
  // the carrier. An empty one reaches FedEx as a request for availability of
  // nothing.
  for (const s of CATALOGUE.services) {
    assert.ok(s.carrier_code.length > 0, `${s.code} has no carrier_code`);
  }
});

test("display_order is dense and starts at zero on both lists", () => {
  // The selectors render in this order, and it is the order the browser used to
  // get for free from Object.keys() on a literal.
  for (const list of [CATALOGUE.handoffs, CATALOGUE.services]) {
    const orders = list.map((x) => x.display_order).sort((a, b) => a - b);
    assert.deepEqual(orders, list.map((_, i) => i));
  }
});
