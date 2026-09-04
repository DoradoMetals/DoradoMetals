// THE STEPPER'S "CAN I PROCEED" QUESTIONS, pure over the row's own `missing`
// list. CheckoutView is `Checkout & { missing }`, and that list is COMPOSED
// (rulings 69/70): the checkout's own four steps, then whatever the draft
// fulfillment says its handover still owes. So the browser reads one list and
// never asks a second question about a category.
import type { CarrierHandoff, CheckoutMissing } from '@dorado/contracts'

// The money step, and the only one this side of `place` that is not a
// prerequisite for it: a purchase owes a payout account.
const MONEY_STEPS: CheckoutMissing[] = ['payment_details_id']

// Nothing but the money step is left. `readyForRates` used to live here and is
// gone with the columns it read - the parcel's own `missing` gates the rate
// query now, inside @dorado/client's `useFulfillmentRates`.
export function readyForPayment(missing: CheckoutMissing[]): boolean {
  return missing.every((step) => MONEY_STEPS.includes(step))
}

// The list is empty - exactly what `place` would otherwise refuse over.
export function readyToPlace(missing: CheckoutMissing[]): boolean {
  return missing.length === 0
}

// THE ONE PLACE THE TWO VOCABULARIES MEET, mirrored from
// api/domain/fulfillments/rules.ts (the browser cannot import server code): a
// handoff maps to fulfillment method type "CARRIER PICKUP" when it requires a
// schedule, "CARRIER DROPOFF" when it does not. The FulfillmentView carries its
// METHOD row, so this resolves the handoff from that type directly - it used to
// take two lists and the checkout row's `fulfillment_method_id`, a column that
// left in migration 128.
export function resolveHandoff(
  handoffs: CarrierHandoff[],
  method_type: string | null | undefined
): CarrierHandoff | null {
  if (!method_type) return null
  return handoffs.find((h) => h.requires_schedule === (method_type === 'CARRIER PICKUP')) ?? null
}
