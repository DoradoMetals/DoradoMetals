// The payout's own writable facts, and the one read allowed to open the bank
// numbers.
//
// THE RADIOACTIVE RULE, restated where it applies: the patch NEVER reads,
// writes, or returns routing or account numbers, and every read but getDetails
// uses the last-4-only projection.
import withTransaction from "#shared/db/withTransaction.ts";
import { payouts as payoutsRepo } from "#db";
import {
  paymentDetails as payoutDetails, orderTransactions,
} from "#domain";
import {
  assertNamesAField, assertPayout, assertWaivable, assertWritablePayout,
} from "#domain/payouts/rules.ts";
import type { Payout, PayoutDetails, PayoutPatch } from "@dorado/contracts";

// PATCH /api/payouts/:id, in ONE TRANSACTION.
//
// It used to be three: `cost` and `waive_payout_fee` opened one apiece on
// orders.transactions and `method` a third on payments.details, so a patch
// naming all three could commit the fee and fail the method, leaving a payout
// whose recorded charge belonged to an account it no longer pays. The three
// writers take `tx` now (ruling 56) and this is the one place that opens it.
//
// RETURNS THE ROW IT WROTE. A bare success made the caller re-fetch, and a
// re-fetch is a second read that can disagree with the write it follows.
export async function patchPayout(
  payout_id: string, patch: PayoutPatch
): Promise<Payout> {
  assertNamesAField(patch);

  return await withTransaction(async (tx) => {
    // getById resolves every payout via the LEFT join to orders.transactions.
    const order_id = assertWritablePayout(
      payout_id, await payoutsRepo.getById(payout_id, tx)
    );

    // payout_fee lives on orders.transactions (073 split it off the account).
    if (patch.cost !== undefined) {
      await orderTransactions.update(order_id, { payout_fee: patch.cost }, {}, tx);
    }

    // The method is a FOREIGN KEY on payments.details, keyed by the payout's
    // OWN id - the walk this replaced matched nothing for every payout it
    // served (D168). It throws NotFound rather than answering false.
    if (patch.method !== undefined) {
      await payoutDetails.setMethod(payout_id, patch.method, tx);
    }

    // Waiving sets the flag and does NOT touch cost: the stored fee stays a
    // record, the EFFECTIVE fee (pricing/bid.ts) becomes 0. Guarded to
    // purchase orders in the statement - a sale's payout has nowhere to record
    // it.
    if (patch.waive_payout_fee !== undefined) {
      const written = await orderTransactions.update(
        order_id,
        { waive_payout_fee: patch.waive_payout_fee },
        { direction: "purchase" },
        tx
      );
      assertWaivable(payout_id, written);
    }

    // Re-read rather than patching the row in memory: cost and
    // waive_payout_fee land on orders.transactions and method on
    // payments.details, so the composed answer is only correct coming back
    // through the statement that composes them.
    return assertPayout(payout_id, await payoutsRepo.getById(payout_id, tx));
  });
}

// GET /api/orders/:orderId/payouts - the payouts of one order, as rows.
export async function getPayoutsByOrder(order_id: string): Promise<Payout[]> {
  return await payoutsRepo.getMany([order_id]);
}

// THE FULL BANK DETAILS FOR ONE PAYOUT - admin only, one payout at a time, by
// somebody about to execute a transfer. Every other read in this feature is
// last-four only, and no order payload carries these.
//
// The account facts come from the native projection every other read uses and
// the two numbers from the envelopes, which open in payments/details and
// nowhere else. A row with no sealed values answers nulls: the holder, the
// method and the last four are still the answer to the question asked.
//
// IT NAMES THE TWO NEW FIELDS AND NOTHING ELSE. This used to re-spell all
// twelve columns of the payout to graft two onto it, which is a second
// declaration of a projection the SQL already owns - a column added to
// `Payout` would have compiled here and silently gone missing.
export async function getDetails(id: string): Promise<PayoutDetails | undefined> {
  const payout = await payoutsRepo.getById(id);
  if (!payout) return undefined;
  return Object.assign(payout, await payoutDetails.decryptFor(id));
}
