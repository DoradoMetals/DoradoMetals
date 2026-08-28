import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as payoutsService from "#features/payouts/service.ts";
import * as payoutsRepo from "#features/payouts/repo.ts";

// GET /api/orders/:orderId/payouts - the payouts on one order, as rows.
//
// THE ONE DEVIATION FROM "VERBATIM" IS SECURITY, and it is ruling 12's single
// non-negotiable carve-out: exchange.payouts holds routing and account
// numbers in PLAINTEXT (fourteen of them in production), so this read is the
// last-four projection - `right(..., 4)` happens in the statement, and the
// full value never leaves Postgres. The full numbers have exactly one
// endpoint, GET /payouts/:id/details, admin-only, one payout at a time.
//
// A LIST, NOT A SLOT. The composed order carried a `payout` member that was
// an OBJECT OF NULLS whenever the order had none, because a LEFT JOIN fed a
// jsonb_build_object; an order with no payout answers [] here, which is a
// shape rather than a workaround. Admin-only, like the write it feeds.
export const getPayoutsByOrder = asyncHandler(async (req, res) => {
  return res.json(await payoutsRepo.getMany([req.params.orderId]));
});

export const patchPayout = asyncHandler(async (req, res) => {
  const result = await payoutsService.patchPayout(req.params.id, req.body ?? {});
  return res.status(200).json(result);
});

// GET /api/payouts/:id/details - the full bank numbers, admin only, payout-
// keyed (order.payout.id on the wire). The RADIOACTIVE rule is absolute:
// details exist only on this endpoint, never in order payloads, and the
// response is the PayoutDetails contract shape exactly. Replaces the order-
// keyed POST /purchase_orders/get_payout_details.
export const getPayoutDetails = asyncHandler(async (req, res) => {
  const details = await payoutsService.getDetails(req.params.id);
  if (!details) {
    return res.status(404).json({ error: "Not Found", message: `no payout ${req.params.id}` });
  }
  return res.status(200).json(details);
});
