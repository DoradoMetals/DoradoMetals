import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as pickupService from "#features/fulfillments/pickups/service.ts";

export const schedulePickup = asyncHandler(async (req, res) => {
  const { pickup } = req.body;
  return res.status(200).json(await pickupService.schedule(pickup));
});

// GET /api/orders/:orderId/pickups - fulfillments.pickups rows, VERBATIM.
// The PATH lives under /api/orders because the order id is the key the caller
// holds; the HANDLER lives here because this feature owns the table.
export const getPickupsByOrder = asyncHandler(async (req, res) => {
  return res.json(await pickupService.forOrder(req.params.orderId));
});
