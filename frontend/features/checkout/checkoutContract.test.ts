// WHAT THE CHECKOUT SURFACE READS OFF THE SERVER.
//
// This file used to pin `data?.address?.id` - the one field both checkout
// screens dug out of an order response and posted back as `address_id`, and
// the tightest coupling between the two halves of the codebase. That coupling
// is gone: the surface reads `shipper_address_id` / `recipient_address_id` off
// the checkout row and PATCHes an id into the same column. What is worth
// pinning now is the contract that REPLACED the browser's own reasoning -
// `missing` and the three readiness flags - because a component that started
// re-deriving any of them would still render, and would drift silently.
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
  fulfillment_method_type: null,
  handoff_code: null,
  requires_schedule: false,
  item_count: 0,
  missing: ["items", "shipper_address", "package", "handoff", "carrier_service", "payout_account"],
  ready_for_rates: false,
  ready_for_payment: false,
  ready_to_place: false,
  ...over,
});

describe("the composed checkout row", () => {
  test("parses as CheckoutView, computed fields included", () => {
    const parsed = CheckoutView.safeParse(serverRow());
    expect(parsed.success).toBe(true);
  });

  // The stepper disables "Go to Payment" and "Confirm" on these two booleans.
  // If the server ever stopped sending them, `row.ready_for_payment !== true`
  // would disable the button forever rather than fail loudly - so the shape is
  // asserted here instead.
  test("carries the three flags the stepper's buttons read", () => {
    const row = CheckoutView.parse(serverRow());
    expect(typeof row.ready_for_rates).toBe("boolean");
    expect(typeof row.ready_for_payment).toBe("boolean");
    expect(typeof row.ready_to_place).toBe("boolean");
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

  // The handoff round-trip: the browser sends a code and reads the same code
  // back, never the fulfillment method type the server stores behind it.
  test("answers the handoff by the code the selector offered", () => {
    const row = CheckoutView.parse(
      serverRow({
        handoff_code: "CONTACT_FEDEX_TO_SCHEDULE",
        fulfillment_method_type: "CARRIER PICKUP",
        requires_schedule: true,
      })
    );
    expect(row.handoff_code).toBe("CONTACT_FEDEX_TO_SCHEDULE");
    expect(row.requires_schedule).toBe(true);
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
