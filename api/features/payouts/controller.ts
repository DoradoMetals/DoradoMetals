import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as payoutsService from "#features/payouts/service.ts";

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
