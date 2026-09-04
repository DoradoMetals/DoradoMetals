// THE STEPPER'S "CAN I PROCEED" QUESTIONS, pure over the row's own `missing`
// list. CheckoutView shrank to `Checkout & { missing: CheckoutStep[] }`
// (Jacob, 2026-09-04: "Why does it need ready_for_rates? Why does it need
// ready_for_payment?") - `ready_for_rates`, `ready_for_payment` and
// `ready_to_place` were three booleans a stepper can read off `missing`
// itself, so it does, here.
import type { CarrierHandoff, CheckoutStep, FulfillmentMethodRead } from "@dorado/contracts";

const ADDRESS_STEPS: CheckoutStep[] = ["shipper_address", "recipient_address"];
const MONEY_STEPS: CheckoutStep[] = ["payout_account", "payment_method"];

// Mirrors the three refusals GET /checkout/rates raises server-side
// (domain/shipping/operations/service.ts getCheckoutRates): no cart, no
// package, no address. The address step differs by direction
// (shipper_address for a purchase, recipient_address for a sale) but only one
// of the two can ever appear in a given `missing`, so checking both needs no
// direction argument.
export function readyForRates(missing: CheckoutStep[]): boolean {
  return (
    !missing.includes("items") &&
    !missing.includes("package") &&
    !ADDRESS_STEPS.some((step) => missing.includes(step))
  );
}

// Nothing but the money step is missing - payout_account for a purchase,
// payment_method for a sale. Only one of the two can ever appear, so this
// needs no direction either.
export function readyForPayment(missing: CheckoutStep[]): boolean {
  return missing.every((step) => MONEY_STEPS.includes(step));
}

// The list is empty - exactly what `place` would otherwise refuse over.
export function readyToPlace(missing: CheckoutStep[]): boolean {
  return missing.length === 0;
}

// THE ONE PLACE THE TWO VOCABULARIES MEET, mirrored from
// api/domain/shipping/rules.ts (the browser cannot import server code): a
// handoff maps to fulfillment method type "CARRIER PICKUP" when it requires a
// schedule, "CARRIER DROPOFF" when it does not. `missing` says WHETHER a
// shipping step is still outstanding; this says WHICH handoff the row's
// `fulfillment_method_id` already names, so a selector can show it chosen and
// `requires_schedule` can be read off the handoff rather than off the row.
export function resolveHandoff(
  methods: FulfillmentMethodRead[],
  handoffs: CarrierHandoff[],
  fulfillment_method_id: string | null | undefined
): CarrierHandoff | null {
  const method = methods.find((m) => m.id === fulfillment_method_id);
  if (!method) return null;
  return handoffs.find((h) => h.requires_schedule === (method.type === "CARRIER PICKUP")) ?? null;
}
