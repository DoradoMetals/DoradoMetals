// PATCH /api/payouts/:id - the payout's fee, method and fee WAIVER, keyed by
// the payout id the wire already serves (order.payout.id).
//
// THE RADIOACTIVE RULE, restated where it applies: this endpoint NEVER reads,
// writes, or returns routing or account numbers. Both the lookup and the
// answer use the last-4-only projection every payout read uses.
import * as payoutsRepo from "#db/payouts/repo.ts";
import * as payoutDetails from "#domain/payments/details/service.ts";
import * as orderTransactions from "#domain/orders/transactions/service.ts";
import { refusedUnknownField, refusedValue, type Refusal } from "#shared/http/patch-body.ts";
import { Invalid, NotFound } from "#shared/errors.ts";
import { PayoutPatch } from "@dorado/contracts";

// The fee is per-order data and the waiver is a flag, both needed: production payouts diverge from constants.ts defaults in both directions (some are waivers, some are added charges), so a boolean cannot replace the stored cost.
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

// RETURNS THE ROW IT WROTE, not `{success: true}`. A bare success made the
// caller re-fetch to see what it had done, and a re-fetch is a second read that
// can disagree with the write it follows. The projection is the last-four one
// every other payout read uses, so answering with the row adds no exposure.
export async function patchPayout(
  payoutId: string,
  body: PayoutPatch & Record<string, unknown>
): Promise<payoutsRepo.PayoutRow> {
  const refusal = refusedField(body);
  if (refusal) throw new Invalid(refusal.message);

  // getById resolves every payout via the LEFT join to orders.transactions, bringing the order with it - see sql/get_by_id.sql.
  const payout = await payoutsRepo.getById(payoutId);
  if (!payout) throw new NotFound(`no payout ${payoutId}`);
  if (!payout!.order_id) {
    throw new Invalid(`payout ${payoutId} is attached to no order, so its writes have no subject`);
  }
  const orderId = payout!.order_id!;

  if (body.cost !== undefined) {
    // payout_fee lives on orders.transactions (073 split it off the account).
    await orderTransactions.update(orderId, { payout_fee: body.cost });
  }

  if (body.method !== undefined) {
    // The method is a FOREIGN KEY on payments.details, resolved against
    // payments.methods. Keyed by the payout's OWN id - the walk this replaced
    // matched nothing for every payout it existed to serve (D168).
    const changed = await payoutDetails.setMethod(payoutId, body.method);
    if (!changed) throw new NotFound(`no payout ${payoutId}`);
  }

  // Waiving sets the flag; it does NOT touch cost - the stored fee stays a record, the EFFECTIVE fee (pricing/bid.ts) becomes 0. Runs after cost so both facts land from one request.
  if (body.waive_payout_fee !== undefined) {
    // Guarded to purchase orders in the statement: a sale's payout has nowhere to record the waiver flag.
    const written = await orderTransactions.update(
      orderId,
      { waive_payout_fee: body.waive_payout_fee },
      { direction: "purchase" }
    );
    if (!written) {
      throw new Invalid(`payout ${payoutId} is not on a purchase order, so its fee cannot be waived`);
    }
  }

  // Re-read rather than patching the row in memory: `cost` and
  // `waive_payout_fee` land on orders.transactions and `method` on
  // payments.details, so the composed answer is only correct if it comes back
  // through the statement that composes them.
  const written = await payoutsRepo.getById(payoutId);
  if (!written) throw new NotFound(`no payout ${payoutId}`);
  return written;
}

// GET /api/orders/:orderId/payouts - a thin pass to the repo so the controller never imports #db/* directly.
export async function getPayoutsByOrder(
  order_id: string
): Promise<payoutsRepo.PayoutRow[]> {
  return await payoutsRepo.getMany([order_id]);
}

// THE FULL BANK DETAILS FOR ONE PAYOUT - GET /payouts/:id/details, admin only,
// fetched one payout at a time by somebody about to execute a transfer. Every
// other read in this feature is last-four only, and no order payload carries
// these.
//
// IT NO LONGER READS PLAINTEXT. The account facts come from the native
// projection every other read uses, and the two numbers from the envelopes -
// one path, both eras, nothing in the clear.
export type PayoutDetails = payoutsRepo.PayoutRow & {
  routing_number: string | null;
  account_number: string | null;
};

export async function getDetails(id: string): Promise<PayoutDetails | undefined> {
  const payout = await payoutsRepo.getById(id);
  if (!payout) return undefined;

  // The envelopes open in payments/details and nowhere else. A row with no
  // sealed values answers nulls rather than throwing, because the holder, the
  // method and the last four are still the answer to the question asked.
  const opened = await payoutDetails.decryptFor(id);

  return {
    ...payout,
    routing_number: opened?.routing_number ?? null,
    account_number: opened?.account_number ?? null,
  };
}
