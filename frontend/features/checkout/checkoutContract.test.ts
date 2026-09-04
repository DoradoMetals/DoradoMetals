// WHAT THE CHECKOUT SURFACE READS OFF THE SERVER.
//
// This file used to pin `data?.address?.id` - the one field both checkout
// screens dug out of an order response and posted back as `address_id`, and
// the tightest coupling between the two halves of the codebase. That coupling
// is gone: the surface reads `shipper_address_id` / `recipient_address_id` off
// the checkout row and PATCHes an id into the same column.
//
// CheckoutView SHRANK to `Checkout & { missing: CheckoutStep[] }`
// (Jacob, 2026-09-04: "Why does it need ready_for_rates? Why does it need
// ready_for_payment?") - `ready_for_rates`, `ready_for_payment`,
// `ready_to_place`, `item_count`, `fulfillment_method_type` and `handoff_code`
// are gone: the three readiness flags were readings of `missing` a component
// can do itself now (frontend/features/checkout/gates.ts, pinned in its own
// test file), and the handoff fields were a join the row's own
// `fulfillment_method_id` already lets a caller make (gates.ts
// `resolveHandoff`). What is worth pinning here now is just the shrunk shape.
import { describe, expect, test } from "vitest";
import { CheckoutStep, CheckoutView } from "@dorado/contracts";
import { isPayoutComplete, toPayoutForm } from "@/features/checkout/purchase-order-checkout/payoutStep/payoutDraft";

const serverRow = (over: Record<string, unknown> = {}) => ({
  id: "3f1a6d0e-5c33-4f8e-9a1a-2b3c4d5e6f70",
  user_id: "9a1a2b3c-4d5e-4f70-8a1a-2b3c4d5e6f71",
  direction: "purchase",
  payment_method_id: null,
  payment_details_id: null,
  fulfillment_method_id: null,
  appointment_location_id: null,
  pickup_address_id: null,
  shipper_address_id: null,
  recipient_address_id: null,
  carrier_service_id: null,
  package_id: null,
  appointment_time: null,
  fulfillment_id: null,
  pickup_date: null,
  pickup_time: null,
  missing: ["items", "shipper_address", "package", "carrier_service", "payout_account"],
  ...over,
});

describe("the composed checkout row", () => {
  test("parses as CheckoutView, missing included", () => {
    const parsed = CheckoutView.safeParse(serverRow());
    expect(parsed.success).toBe(true);
  });

  // `missing` is a closed enum, so a step the server invents cannot arrive as
  // an unrendered string.
  test("missing is a list of known steps, in the order the stepper walks", () => {
    const row = CheckoutView.parse(serverRow());
    for (const step of row.missing) {
      expect(CheckoutStep.safeParse(step).success).toBe(true);
    }
    expect(row.missing[0]).toBe("items");
  });

  test("a step the server does not know about is refused, not rendered", () => {
    expect(CheckoutView.safeParse(serverRow({ missing: ["insurance"] })).success).toBe(false);
  });
});

describe("the payout draft, which is the one thing the row cannot hold", () => {
  const ach = {
    method: "ACH" as const,
    account_holder_name: "A Customer",
    bank_name: "Test Bank",
    account_type: "Checking" as const,
    routing_number: "021000021",
    account_number: "000123456789",
    confirmation: true,
    cost: 0,
  };

  test("an incomplete form is not complete", () => {
    expect(isPayoutComplete(null)).toBe(false);
    expect(isPayoutComplete({ method: "ACH" })).toBe(false);
    expect(isPayoutComplete({ ...ach, routing_number: "123" })).toBe(false);
    // The confirmation checkbox is part of the rule, and it is client-only.
    expect(isPayoutComplete({ ...ach, confirmation: false })).toBe(false);
  });

  test("a complete form is complete", () => {
    expect(isPayoutComplete(ach)).toBe(true);
  });

  // POST /checkout/payout is strict: a confirmation checkbox or a displayed
  // fee would be refused as an unknown key, and a 422 at the last step of the
  // sell flow is the whole checkout.
  test("only the seven wire columns are sent", () => {
    expect(Object.keys(toPayoutForm(ach)).sort()).toEqual([
      "account_holder_name",
      "account_number",
      "account_type",
      "bank_name",
      "method",
      "payout_email",
      "routing_number",
    ]);
  });
});
