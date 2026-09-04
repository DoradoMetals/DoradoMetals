import { Invalid, NotFound } from "#shared/errors.ts";
import type { Payout, PayoutPatch } from "@dorado/contracts";

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

export function assertPayout(payout_id: string, payout: Payout | undefined): Payout {
  if (!payout) throw new NotFound(`no payout ${payout_id}`);
  return payout;
}

export function assertNamesAField(patch: PayoutPatch): PayoutPatch {
  if (Object.keys(patch).length === 0) {
    throw new Invalid("the document names no field to write");
  }
  return patch;
}

export function assertWaivable(payout_id: string, written: boolean): void {
  if (!written) {
    throw new Invalid(
      `payout ${payout_id} is not on a purchase order, so its fee cannot be waived`
    );
  }
}
