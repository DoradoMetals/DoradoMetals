import { test } from "vitest";
import assert from "node:assert/strict";
import {
  declaredValue, handoffFor, parcelFor, parcelWeightLb, quotedCharge,
  scheduleFromPickup, scheduleOf,
} from "#domain/shipping/rules.ts";
import { Invalid } from "#shared/errors.ts";
import type {
  CarrierHandoff, FulfillmentPickup, LabelService, Package,
} from "@dorado/contracts";

test("the parcel weighs what its items weigh, converted to pounds", () => {
  const weight = parcelWeightLb(
    [{ pre_melt: 453.592, unit: "g", quantity: 1 }], { min_weight_lb: 0.5 }
  );
  assert.ok(Math.abs(weight - 1) < 1e-9, `expected ~1 lb, got ${weight}`);
});

test("a bullion line's weight scales with quantity", () => {
  const weight = parcelWeightLb(
    [{ pre_melt: 1, unit: "t oz", quantity: 6 }], { min_weight_lb: 0 }
  );
  assert.ok(weight > 0 && weight < 1, `six troy ounces should weigh under a pound, got ${weight}`);
});

test("the box's own minimum wins when the items weigh less", () => {
  const weight = parcelWeightLb(
    [{ pre_melt: 1, unit: "t oz", quantity: 1 }], { min_weight_lb: 2 }
  );
  assert.equal(weight, 2, "a coin weighs far less than the box's own minimum");
});

test("a null package and an unrecognised unit are both worth nothing extra", () => {
  assert.equal(parcelWeightLb([{ pre_melt: 5, unit: "kg", quantity: 1 }], null), 0);
  assert.equal(parcelWeightLb([], undefined), 0);
});

test("declaredValue passes a positive total through unchanged", () => {
  assert.equal(declaredValue(2500), 2500);
});

test("declaredValue floors at zero rather than going negative or NaN", () => {
  assert.equal(declaredValue(-100), 0);
  assert.equal(declaredValue(NaN), 0);
  assert.equal(declaredValue(0), 0);
});

const DROPOFF: CarrierHandoff = {
  code: "DROPOFF", name: "Store Dropoff", requires_schedule: false,
  has_dropoff_locations: true, display_order: 1,
};
const COLLECTION: CarrierHandoff = {
  code: "PICKUP", name: "Carrier Pickup", requires_schedule: true,
  has_dropoff_locations: false, display_order: 2,
};
const A_SERVICE = {
  carrier_id: "c", id: "s", name: "Express Saver", code: "SAVER",
  carrier_code: "FDXE", display_order: 1, max_insured_value: 10_000,
} as LabelService;
const A_BOX = { length: 10, width: 8, height: 6 } as unknown as Package;

test("a carrier pickup needs a date and a time, and a dropoff carries no slot", () => {
  const slot = scheduleOf("2026-09-04", "14:00");
  const collected = parcelFor(A_SERVICE, A_BOX, COLLECTION, 2500, 2, slot);
  assert.deepEqual(collected.schedule, { date: "2026-09-04", time: "14:00" });
  assert.equal(collected.weight.value, 2);
  assert.equal(collected.declaredValue, 2500);
  assert.equal(collected.serviceType, "SAVER");
  assert.equal(collected.carrierCode, "FDXE");

  assert.equal(parcelFor(A_SERVICE, A_BOX, DROPOFF, 0, 2, slot).schedule, null);
  assert.throws(() => parcelFor(A_SERVICE, A_BOX, COLLECTION, 0, 2, null), Invalid);
});

test("a parcel needs a real box and a weight above zero", () => {
  assert.throws(() => parcelFor(A_SERVICE, undefined, DROPOFF, 0, 2, null), Invalid);
  assert.throws(() => parcelFor(A_SERVICE, A_BOX, DROPOFF, 0, 0, null), Invalid);
});

test("the handoff a method means is the one whose schedulability matches", () => {
  const handoffs = [DROPOFF, COLLECTION];
  assert.equal(handoffFor(handoffs, "CARRIER PICKUP"), COLLECTION);
  assert.equal(handoffFor(handoffs, "CARRIER DROPOFF"), DROPOFF);
  assert.equal(handoffFor(handoffs, null), DROPOFF);
  assert.throws(() => handoffFor([], "CARRIER PICKUP"), Error);
});

test("the courier slot comes off the order's own pickup row", () => {
  assert.deepEqual(
    scheduleFromPickup(
      { start_time: "2026-09-04T14:30:00.000Z" } as FulfillmentPickup
    ),
    { date: "2026-09-04", time: "14:30" }
  );
  assert.equal(scheduleFromPickup(undefined), null);
  assert.equal(scheduleFromPickup({ start_time: null } as FulfillmentPickup), null);
  assert.equal(scheduleOf("2026-09-04", null), null);
});

test("postage with no quote is refused rather than priced at nothing", () => {
  assert.equal(
    quotedCharge(
      [{ serviceType: "SAVER", netCharge: 24.5 }, { serviceType: "OTHER", netCharge: 9 }],
      "SAVER"
    ),
    24.5
  );
  assert.throws(() => quotedCharge([{ serviceType: "OTHER", netCharge: 9 }], "SAVER"), Invalid);
  assert.throws(() => quotedCharge([{ serviceType: "SAVER", netCharge: null }], "SAVER"), Invalid);
});
