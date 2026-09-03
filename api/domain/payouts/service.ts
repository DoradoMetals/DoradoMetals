// The payout's own writable facts, and the one read allowed to open the bank
// numbers.
//
// THE RADIOACTIVE RULE, restated where it applies: the patch NEVER reads,
// writes, or returns routing or account numbers, and every read but getDetails
// uses the last-4-only projection.
import * as payoutsRepo from "#db/payouts/repo.ts";
import * as payoutDetails from "#domain/payments/details/service.ts";
import * as orderTransactions from "#domain/orders/transactions/service.ts";
import { Invalid, NotFound } from "#shared/errors.ts";
import type { exchange } from "@dorado/contracts";
import type { PayoutRow } from "#db/payouts/repo.ts";

// A payout the caller may write to: it exists, and it is attached to the order
// whose transactions row holds the fee and the waiver.
function orderOf(payout_id: string, payout: PayoutRow | undefined): string {
  if (!payout) throw new NotFound(`no payout ${payout_id}`);
  if (!payout.order_id) {
    throw new Invalid(`payout ${payout_id} is attached to no order, so its writes have no subject`);
  }
  return payout.order_id;
}

// RETURNS THE ROW IT WROTE. A bare success made the caller re-fetch, and a
// re-fetch is a second read that can disagree with the write it follows.
export async function patchPayout(
  payout_id: string, patch: exchange.payouts.Patch
): Promise<PayoutRow> {
  if (Object.keys(patch).length === 0) {
    throw new Invalid("the document names no field to write");
  }

  // getById resolves every payout via the LEFT join to orders.transactions.
  const order_id = orderOf(payout_id, await payoutsRepo.getById(payout_id));

  // payout_fee lives on orders.transactions (073 split it off the account).
  if (patch.cost !== undefined) {
    await orderTransactions.update(order_id, { payout_fee: patch.cost });
  }

  // The method is a FOREIGN KEY on payments.details, keyed by the payout's OWN
  // id - the walk this replaced matched nothing for every payout it served (D168).
  if (patch.method !== undefined) {
    const changed = await payoutDetails.setMethod(payout_id, patch.method);
    if (!changed) throw new NotFound(`no payout ${payout_id}`);
  }

  // Waiving sets the flag and does NOT touch cost: the stored fee stays a
  // record, the EFFECTIVE fee (pricing/bid.ts) becomes 0. Guarded to purchase
  // orders in the statement - a sale's payout has nowhere to record it.
  if (patch.waive_payout_fee !== undefined) {
    const written = await orderTransactions.update(
      order_id, { waive_payout_fee: patch.waive_payout_fee }, { direction: "purchase" }
    );
    if (!written) {
      throw new Invalid(`payout ${payout_id} is not on a purchase order, so its fee cannot be waived`);
    }
  }

  // Re-read rather than patching the row in memory: cost and waive_payout_fee
  // land on orders.transactions and method on payments.details, so the composed
  // answer is only correct coming back through the statement that composes them.
  const written = await payoutsRepo.getById(payout_id);
  if (!written) throw new NotFound(`no payout ${payout_id}`);
  return written;
}

// GET /api/orders/:orderId/payouts - the payouts of one order, as rows.
export async function getPayoutsByOrder(order_id: string): Promise<PayoutRow[]> {
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
export type PayoutDetails = PayoutRow & {
  routing_number: string | null;
  account_number: string | null;
};

export async function getDetails(id: string): Promise<PayoutDetails | undefined> {
  const payout = await payoutsRepo.getById(id);
  if (!payout) return undefined;
  const opened = await payoutDetails.decryptFor(id);

  return {
    id: payout.id,
    user_id: payout.user_id,
    order_id: payout.order_id,
    method: payout.method,
    account_holder_name: payout.account_holder_name,
    bank_name: payout.bank_name,
    account_type: payout.account_type,
    account_last4: payout.account_last4,
    routing_last4: payout.routing_last4,
    email_to: payout.email_to,
    cost: payout.cost,
    created_at: payout.created_at,
    routing_number: opened?.routing_number ?? null,
    account_number: opened?.account_number ?? null,
  };
}
