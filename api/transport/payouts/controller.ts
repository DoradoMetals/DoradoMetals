import { param } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as payoutsService from "#domain/payouts/service.ts";
import * as payoutsRepo from "#db/payouts/repo.ts";

// GET /api/orders/:orderId/payouts - the payouts on one order, as rows.
//
// THE ONE DEVIATION FROM "VERBATIM" IS SECURITY, and it is ruling 12's single
// non-negotiable carve-out: the full routing and account numbers are not
// columns of this read at all. It projects the two last-four values, which is
// what the panel renders; the full numbers have exactly one endpoint,
// GET /payouts/:id/details, admin-only, one payout at a time.
//
// ONE READ SINCE D213. This used to ask exchange.payouts first and fall back
// to the native composition for a D210 order, which meant the answer depended
// on which era the order was created in - and every order created after the
// purge fell through the first read silently. getMany is native now and
// answers both, so there is no era to branch on.
//
// A LIST, NOT A SLOT. The composed order carried a `payout` member that was
// an OBJECT OF NULLS whenever the order had none, because a LEFT JOIN fed a
// jsonb_build_object; an order with no payout answers [] here, which is a
// shape rather than a workaround. Admin-only, like the write it feeds.
export const getPayoutsByOrder = asyncHandler(async (req, res) => {
  return res.json(await payoutsRepo.getMany([param(req, "orderId")]));
});

export const patchPayout = asyncHandler(async (req, res) => {
  const result = await payoutsService.patchPayout(param(req, "id"), req.body ?? {});
  return res.status(200).json(result);
});

// GET /api/payouts/:id/details - the full bank numbers, admin only, payout-
// keyed (order.payout.id on the wire). The RADIOACTIVE rule is absolute:
// details exist only on this endpoint, never in order payloads, and the
// response is the PayoutDetails contract shape exactly. Replaces the order-
// keyed POST /purchase_orders/get_payout_details.
export const getPayoutDetails = asyncHandler(async (req, res) => {
  const details = await payoutsService.getDetails(param(req, "id"));
  if (!details) {
    return res.status(404).json({ error: "Not Found", message: `no payout ${param(req, "id")}` });
  }
  return res.status(200).json(details);
});
