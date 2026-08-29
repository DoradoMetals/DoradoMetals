// PATCH /api/payouts/:id - the payout's fee, method and fee WAIVER, keyed by
// the payout id the wire already serves (order.payout.id).
//
// Jacob's principle, final form (28 August): one endpoint per RESOURCE, owned
// by its feature. Both writes dispatch to the SAME order-keyed services the
// old routes called - routing moved, logic did not.
//
// THE RADIOACTIVE RULE, restated where it applies: this endpoint NEVER reads,
// writes, or returns routing or account numbers. The lookup uses the
// last-4-only projection every payout read uses, and the response is a bare
// success - not the row - so nothing here can grow into a leak.
import * as payoutsRepo from "#features/payouts/repo.ts";
import * as purchaseOrderService from "#features/orders/service.ts";
import { refusedUnknownField, refusedValue, type Refusal } from "#shared/http/patch-body.ts";
import { PayoutPatch } from "@dorado/contracts";

const refuse = (statusCode: number, message: string): never => {
  const err: Error & { statusCode?: number } = new Error(message);
  err.statusCode = statusCode;
  throw err;
};

// THE BODY IS THE CONTRACT'S (A3). This one had not drifted - it was declared
// twice and the two agreed - so the move is what the move is for: there is now
// one place to add a field, and `waive_payout_fee` is the first field added
// there rather than in two.
//
// THE FEE IS PER-ORDER DATA AND THE WAIVER IS A FLAG, and production needs
// both. features/payouts/constants.ts is a table of DEFAULTS; four of the 62
// production payouts disagree with it, in TWO directions - two WIRE rows at 0
// against a 20 default, and two ECHECK rows at 75 and 125 against a 0 default.
// Jacob confirmed the first pair are waivers. The second pair are CHARGES, and
// a boolean cannot express a charge, which is why `cost` stays the per-order
// fee and the flag is a separate field rather than a replacement for it.
export type { PayoutPatch } from "@dorado/contracts";

const FIELDS = Object.keys(PayoutPatch.shape);

export function refusedField(body: Record<string, unknown>): Refusal | null {
  const unknown = refusedUnknownField(body, FIELDS, "a payout PATCH");
  if (unknown) return unknown;
  if (Object.keys(body ?? {}).length === 0) {
    return { statusCode: 400, message: "the document names no field to write" };
  }
  return refusedValue(PayoutPatch, body ?? {});
}

export async function patchPayout(
  payoutId: string,
  body: PayoutPatch & Record<string, unknown>
): Promise<{ success: true }> {
  const refusal = refusedField(body);
  if (refusal) refuse(refusal.statusCode, refusal.message);

  const payout = await payoutsRepo.getById(payoutId);
  if (!payout) refuse(404, `no payout ${payoutId}`);
  if (!payout!.order_id) {
    refuse(422, `payout ${payoutId} is attached to no order, so its writes have no subject`);
  }
  const orderId = payout!.order_id!;

  if (body.cost !== undefined) {
    await purchaseOrderService.editPayoutCharge({
      order_id: orderId,
      payout_charge: body.cost,
    });
  }

  if (body.method !== undefined) {
    await purchaseOrderService.changePayoutMethod({
      order_id: orderId,
      method: body.method,
    });
  }

  // THE WAIVER, AND IT DOES NOT TOUCH `cost`. Waiving sets the flag and the
  // EFFECTIVE fee becomes 0 (pricing/bid.ts's effectivePayoutFee); the stored
  // fee keeps what it would have been, because a stored fee is a record (D117)
  // and un-waiving must not have to guess. Runs AFTER `cost` so a document
  // that sets a fee and waives it in one request leaves both facts recorded,
  // the same ordering rule the order PATCH uses for status.
  if (body.waive_payout_fee !== undefined) {
    const { written } = await purchaseOrderService.setWaivePayoutFee({
      order_id: orderId,
      waived: body.waive_payout_fee,
    });
    // The flag is a purchase-order column; every payout in production hangs
    // off one. A payout whose order is a SALE has nowhere to record this, and
    // saying so is better than a 200 that wrote nothing.
    if (!written) {
      refuse(422, `payout ${payoutId} is not on a purchase order, so its fee cannot be waived`);
    }
  }

  return { success: true };
}

// The full bank details for one payout - the repo's rules apply (see
// sql/get_details.sql): admin only at the route, never logged, never carried
// by an order payload.
export async function getDetails(
  id: string
): Promise<payoutsRepo.PayoutDetailsRow | undefined> {
  return await payoutsRepo.getDetails(id);
}
