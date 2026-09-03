// PATCH /api/payouts/:id - the payout's fee, method and fee WAIVER, keyed by
// the payout id the wire already serves (order.payout.id).
//
// Jacob's principle, final form (28 August): one endpoint per RESOURCE, owned
// by its feature. Both writes dispatch to the SAME order-keyed services the
// old routes called - routing moved, logic did not.
//
// THE RADIOACTIVE RULE, restated where it applies: this endpoint NEVER reads,
// writes, or returns routing or account numbers. Both the lookup and the answer
// use the last-4-only projection every payout read uses, so nothing here can
// grow into a leak.
import * as payoutsRepo from "#db/payouts/repo.ts";
import * as payoutDetails from "#domain/payments/details/service.ts";
import * as orderTransactions from "#domain/orders/transactions/service.ts";
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

// RETURNS THE ROW IT WROTE, not `{success: true}`. A bare success made the
// caller re-fetch to see what it had done, and a re-fetch is a second read that
// can disagree with the write it follows. The projection is the last-four one
// every other payout read uses, so answering with the row adds no exposure.
export async function patchPayout(
  payoutId: string,
  body: PayoutPatch & Record<string, unknown>
): Promise<payoutsRepo.PayoutRow> {
  const refusal = refusedField(body);
  if (refusal) refuse(refusal.statusCode, refusal.message);

  // ONE LOOKUP SINCE D213. getById reads payments.details joined to
  // orders.transactions, so it resolves every payout of either era and brings
  // the order with it; the second, order-resolving read this used to need for
  // a D210 id is gone. The two refusals stay distinct because the LEFT join
  // keeps them distinguishable - see sql/get_by_id.sql.
  const payout = await payoutsRepo.getById(payoutId);
  if (!payout) refuse(404, `no payout ${payoutId}`);
  if (!payout!.order_id) {
    refuse(422, `payout ${payoutId} is attached to no order, so its writes have no subject`);
  }
  const orderId = payout!.order_id!;

  if (body.cost !== undefined) {
    // The fee is orders.transactions.payout_fee (073 split it off the
    // account), written through that table's one update.
    await orderTransactions.update(orderId, { payout_fee: body.cost });
  }

  if (body.method !== undefined) {
    // The method is a FOREIGN KEY on payments.details, resolved against
    // payments.methods rather than stored as a string. Keyed by the payout's
    // OWN id: the walk this replaced ran order -> payments.intents -> details,
    // and an intent is money coming IN, so it matched nothing for every payout
    // it existed to serve (D168).
    const changed = await payoutDetails.setMethod(payoutId, body.method);
    if (!changed) refuse(404, `no payout ${payoutId}`);
  }

  // THE WAIVER, AND IT DOES NOT TOUCH `cost`. Waiving sets the flag and the
  // EFFECTIVE fee becomes 0 (pricing/bid.ts's effectivePayoutFee); the stored
  // fee keeps what it would have been, because a stored fee is a record (D117)
  // and un-waiving must not have to guess. Runs AFTER `cost` so a document
  // that sets a fee and waives it in one request leaves both facts recorded,
  // the same ordering rule the order PATCH uses for status.
  if (body.waive_payout_fee !== undefined) {
    // Guarded to the purchase direction IN THE STATEMENT: a payout fee is a
    // purchase-order fact, and a payout hanging off a SALE has nowhere to
    // record the flag - saying so beats a 200 that wrote nothing.
    const written = await orderTransactions.update(
      orderId,
      { waive_payout_fee: body.waive_payout_fee },
      { direction: "purchase" }
    );
    if (!written) {
      refuse(422, `payout ${payoutId} is not on a purchase order, so its fee cannot be waived`);
    }
  }

  // Re-read rather than patching the row in memory: `cost` and
  // `waive_payout_fee` land on orders.transactions and `method` on
  // payments.details, so the composed answer is only correct if it comes back
  // through the statement that composes them.
  const written = await payoutsRepo.getById(payoutId);
  if (!written) refuse(404, `no payout ${payoutId}`);
  return written!;
}

// GET /api/orders/:orderId/payouts - the payouts on one order, as rows. A
// thin pass to the repo so the controller never imports #db/* directly.
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
// *** IT NO LONGER READS PLAINTEXT. *** Until now this asked exchange.payouts
// first (`SELECT routing_number, account_number ...`), then walked the order to
// find a dual-era row, and only fell through to the sealed values. That was the
// last live read of a plaintext bank number in this codebase, and it made the
// answer depend on which era an order was created in. The account facts now
// come from the native projection every other read uses, and the two numbers
// from the envelopes - one path, both eras, nothing in the clear.
//
// THE SHAPE CHANGED WITH THE SOURCE, deliberately (shapes are not being
// preserved on this branch): what comes back is the payout row this feature
// already serves, plus the two opened numbers. The old shape was
// exchange.payouts' columns, which is a table this endpoint no longer touches.
export type PayoutDetails = payoutsRepo.PayoutRow & {
  routing_number: string | null;
  account_number: string | null;
};

export async function getDetails(id: string): Promise<PayoutDetails | undefined> {
  const payout = await payoutsRepo.getById(id);
  if (!payout) return undefined;

  // The envelopes open in payments/details and nowhere else. A row with no
  // sealed values - an ECHECK or DORADO_ACCOUNT payout, or one whose plaintext
  // has not been sealed yet - answers nulls rather than throwing, because the
  // holder, the method and the last four are still the answer to the question
  // asked.
  const opened = await payoutDetails.decryptFor(id);

  return {
    ...payout,
    routing_number: opened?.routing_number ?? null,
    account_number: opened?.account_number ?? null,
  };
}
