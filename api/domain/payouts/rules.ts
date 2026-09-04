// The payout's pure decisions. No database, no cipher, no request.
import { Invalid, NotFound } from "#shared/errors.ts";
import type { Payout, PayoutPatch } from "@dorado/contracts";

// A payout the caller may write to: it exists, and it is attached to the order
// whose transactions row holds the fee and the waiver. The two refusals are
// different questions and answer differently on purpose - 404 for an account
// that is not there, 422 for one that is but pays for nothing.
export function assertWritablePayout(
  payout_id: string, payout: Payout | undefined
): string {
  const { order_id } = assertPayout(payout_id, payout);
  if (!order_id) {
    throw new Invalid(
      `payout ${payout_id} is attached to no order, so its writes have no subject`
    );
  }
  return order_id;
}

// The payout is there at all. Its own refusal because the patch asks it twice:
// once to find the order the writes key on, and once of the composed row that
// comes back afterwards.
export function assertPayout(payout_id: string, payout: Payout | undefined): Payout {
  if (!payout) throw new NotFound(`no payout ${payout_id}`);
  return payout;
}

// A PATCH THAT NAMES NOTHING is a request with no subject, not a no-op write:
// answering 200 to it would say a change was made.
export function assertNamesAField(patch: PayoutPatch): PayoutPatch {
  if (Object.keys(patch).length === 0) {
    throw new Invalid("the document names no field to write");
  }
  return patch;
}

// WAIVING IS A PURCHASE-ORDER FACT. The statement guards on the direction, so
// a write that changed nothing means the payout hangs off a sale, which has
// nowhere to record a waived payout fee.
export function assertWaivable(payout_id: string, written: boolean): void {
  if (!written) {
    throw new Invalid(
      `payout ${payout_id} is not on a purchase order, so its fee cannot be waived`
    );
  }
}
