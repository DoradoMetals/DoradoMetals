import { param } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as payoutsService from "#domain/payouts/service.ts";

// GET /api/orders/:orderId/payouts - the payouts on one order, as rows.
// Projects last-4 only: full routing/account numbers are never columns here, reachable only via GET /payouts/:id/details.
// A list, not a slot: an order with no payout answers [] here, not an object of nulls.
export const getPayoutsByOrder = asyncHandler(async (req, res) => {
  return res.json(await payoutsService.getPayoutsByOrder(param(req, "orderId")));
});

export const patchPayout = asyncHandler(async (req, res) => {
  const result = await payoutsService.patchPayout(param(req, "id"), req.body ?? {});
  return res.status(200).json(result);
});

// GET /api/payouts/:id/details - the full bank numbers, admin only, payout-keyed (order.payout.id on the wire).
// These values exist only on this endpoint, never in order payloads.
export const getPayoutDetails = asyncHandler(async (req, res) => {
  const details = await payoutsService.getDetails(param(req, "id"));
  if (!details) {
    return res.status(404).json({ error: "Not Found", message: `no payout ${param(req, "id")}` });
  }
  return res.status(200).json(details);
});
