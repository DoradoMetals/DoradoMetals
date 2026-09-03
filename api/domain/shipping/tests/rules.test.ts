// Pure rules, no database (ruling 58).
import { test } from "vitest";
import assert from "node:assert/strict";
import { declaredValue, parcelWeightLb } from "#domain/shipping/rules.ts";

test("the parcel weighs what its items weigh, converted to pounds", () => {
  // 453.592 g is one pound - a single item at that weight, quantity 1, with a
  // box whose own minimum is lower, is governed by the item.
  const weight = parcelWeightLb(
    [{ pre_melt: 453.592, unit: "g", quantity: 1 }], { min_weight_lb: 0.5 }
  );
  assert.ok(Math.abs(weight - 1) < 1e-9, `expected ~1 lb, got ${weight}`);
});

test("a bullion line's weight scales with quantity", () => {
  // 1 troy oz is far under a pound; six of them still are.
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
