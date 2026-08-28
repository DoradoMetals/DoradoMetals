// PATCH /api/payouts/:id - the payout's cost and method, keyed by the payout
// id the wire already serves (order.payout.id).
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
import * as purchaseOrderService from "#features/purchase-orders/service.ts";

const refuse = (statusCode: number, message: string): never => {
  const err: Error & { statusCode?: number } = new Error(message);
  err.statusCode = statusCode;
  throw err;
};

export type PayoutPatch = {
  cost?: number;
  method?: string;
};

const FIELDS = ["cost", "method"] as const;

export function refusedField(
  body: Record<string, unknown>
): { statusCode: number; message: string } | null {
  const present = Object.keys(body ?? {});
  for (const field of present) {
    if (!(FIELDS as readonly string[]).includes(field)) {
      return { statusCode: 400, message: `"${field}" is not a field of a payout PATCH` };
    }
  }
  if (present.length === 0) {
    return { statusCode: 400, message: "the document names no field to write" };
  }
  return null;
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
