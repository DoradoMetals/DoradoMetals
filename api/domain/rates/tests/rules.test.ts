import { test } from "vitest";
import assert from "node:assert/strict";
import * as rules from "#domain/rates/rules.ts";

test("assertRate throws NotFound when the row is missing", () => {
  assert.throws(() => rules.assertRate(undefined, "abc"), /no rate abc/);
});

test("assertRate does not throw when the row is present", () => {
  assert.doesNotThrow(() => rules.assertRate({ id: "abc" }, "abc"));
});

test("assertChanged throws NotFound when nothing changed", () => {
  assert.throws(() => rules.assertChanged(false, "abc"), /no rate abc/);
});

test("assertChanged does not throw when something changed", () => {
  assert.doesNotThrow(() => rules.assertChanged(true, "abc"));
});
