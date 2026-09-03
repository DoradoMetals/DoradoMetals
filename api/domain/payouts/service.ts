// PATCH /api/payouts/:id - the payout's fee, method and fee waiver, keyed by the payout id the wire already serves (order.payout.id).
// NEVER reads, writes, or returns routing or account numbers: the lookup is last-4-only, and the response is a bare success, not the row.
import * as payoutsRepo from "#db/payouts/repo.ts";
import * as payoutDetails from "#domain/payments/details/service.ts";
import * as payoutAccounts from "#db/payments/details/repo.ts";
import * as orderTransactions from "#domain/orders/transactions/service.ts";
import { refusedUnknownField, refusedValue, type Refusal } from "#shared/http/patch-body.ts";
import { PayoutPatch } from "@dorado/contracts";

const refuse = (statusCode: number, message: string): never => {
  const err: Error & { statusCode?: number } = new Error(message);
  err.statusCode = statusCode;
  throw err;
};

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

export async function patchPayout(
  payoutId: string,
  body: PayoutPatch & Record<string, unknown>
): Promise<{ success: true }> {
  const refusal = refusedField(body);
  if (refusal) refuse(refusal.statusCode, refusal.message);

  // getById resolves every payout via the LEFT join to orders.transactions, bringing the order with it - see sql/get_by_id.sql.
  const payout = await payoutsRepo.getById(payoutId);
  if (!payout) refuse(404, `no payout ${payoutId}`);
  if (!payout!.order_id) {
    refuse(422, `payout ${payoutId} is attached to no order, so its writes have no subject`);
  }
  const orderId = payout!.order_id!;

  if (body.cost !== undefined) {
    // payout_fee lives on orders.transactions (073 split it off the account).
    await orderTransactions.update(orderId, { payout_fee: body.cost });
  }

  if (body.method !== undefined) {
    // method is a foreign key on payments.details (resolved against payments.methods), reached via orders.transactions.payout_details_id.
    await payoutAccounts.setMethodForOrder(orderId, body.method);
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
      refuse(422, `payout ${payoutId} is not on a purchase order, so its fee cannot be waived`);
    }
  }

  return { success: true };
}

// GET /api/orders/:orderId/payouts - a thin pass to the repo so the controller never imports #db/* directly.
export async function getPayoutsByOrder(
  order_id: string
): Promise<payoutsRepo.PayoutRow[]> {
  return await payoutsRepo.getMany([order_id]);
}

// The full bank details for one payout - admin only at the route, never logged, never carried by an order payload (see sql/get_details.sql).
export async function getDetails(
  id: string
): Promise<payoutsRepo.PayoutDetailsRow | undefined> {
  const legacy = await payoutsRepo.getDetails(id);
  if (legacy) return legacy;

  // id is a payments.details id; where the dual era minted a fresh one, the plaintext still lives on the order's exchange payout - walk to it rather than reporting nothing.
  const order_id = await payoutsRepo.orderOfDetails(id);
  if (order_id) {
    const byOrder = await payoutsRepo.getDetailsByOrder(order_id);
    if (byOrder) return byOrder;
  }

  // Otherwise the numbers are sealed (D210); this is their one door, and the decrypt happens in the details service - envelopes never open elsewhere.
  const opened = await payoutDetails.decryptFor(id);
  if (!opened) return undefined;
  return {
    id,
    user_id: null,
    order_id,
    method: opened.method,
    account_holder_name: opened.account_holder,
    bank_name: opened.bank_name,
    account_type: opened.account_type,
    routing_number: opened.routing_number,
    account_number: opened.account_number,
    created_at: null,
    email_to: opened.email_to,
    cost: null,
  } as unknown as payoutsRepo.PayoutDetailsRow;
}
