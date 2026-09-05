import { test } from "vitest";
import assert from "node:assert/strict";
import * as rules from "#domain/payments/rules.ts";

test("isOpen is true only for a status still awaiting the customer", () => {
  for (const status of ["requires_payment_method", "requires_confirmation", "requires_action"]) {
    assert.equal(rules.isOpen(status), true, `${status} should be open`);
  }
  for (const status of ["succeeded", "canceled", "processing", null, undefined]) {
    assert.equal(rules.isOpen(status), false, `${String(status)} should not be open`);
  }
});

test("isResolved is true for a terminal-or-processing status", () => {
  for (const status of ["canceled", "succeeded", "processing"]) {
    assert.equal(rules.isResolved(status), true, `${status} should be resolved`);
  }
  for (const status of ["requires_payment_method", null, undefined]) {
    assert.equal(rules.isResolved(status), false, `${String(status)} should not be resolved`);
  }
});

test("isSettled is narrower than isResolved - processing and succeeded only", () => {
  assert.equal(rules.isSettled("succeeded"), true);
  assert.equal(rules.isSettled("processing"), true);
  assert.equal(rules.isSettled("canceled"), false, "a canceled intent moved no money");
  assert.equal(rules.isSettled(null), false);
});

test("paymentSurface offers a card only once Stripe's own minimum is met", () => {
  assert.equal(rules.paymentSurface(0.49), "credit");
  assert.equal(rules.paymentSurface(0.5), "card");
  assert.equal(rules.paymentSurface(100), "card");
});
