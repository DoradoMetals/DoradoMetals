import { param } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as payoutsService from "#domain/payouts/service.ts";

// GET /api/orders/:orderId/payouts - the payouts on one order, as rows.
//
// THE ONE DEVIATION FROM "VERBATIM" IS SECURITY, and it is ruling 12's single
// non-negotiable carve-out: the full routing and account numbers are not
// columns of this read at all. It projects the two last-four values; the
// full numbers have exactly one endpoint, GET /payouts/:id/details.
//
// A LIST, NOT A SLOT. The composed order carried a `payout` member that was
// an OBJECT OF NULLS whenever the order had none - an order with no payout
// answers [] here, which is a shape rather than a workaround.
export const getPayoutsByOrder = asyncHandler(async (req, res) => {
  return res.json(await payoutsService.getPayoutsByOrder(param(req, "orderId")));
});

// Answers the payout ROW the write produced, where it used to answer
// `{success: true}` and leave the caller to re-fetch. Last-four projection, as
// everywhere else in this feature.
export const patchPayout = asyncHandler(async (req, res) => {
  const row = await payoutsService.patchPayout(param(req, "id"), req.body ?? {});
  return res.status(200).json(row);
});

// GET /api/payouts/:id/details - the full bank numbers, admin only, payout-
// keyed (the payments.details id the order wire serves as payout.id). The
// RADIOACTIVE rule is absolute: details exist only on this endpoint and never
// in an order payload.
export const getPayoutDetails = asyncHandler(async (req, res) => {
  const details = await payoutsService.getDetails(param(req, "id"));
  if (!details) {
    return res.status(404).json({ error: "Not Found", message: `no payout ${param(req, "id")}` });
  }
  return res.status(200).json(details);
});
