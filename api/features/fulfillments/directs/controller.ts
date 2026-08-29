import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as directService from "#features/fulfillments/directs/service.ts";

export const scheduleDirect = asyncHandler(async (req, res) => {
  const { direct } = req.body;
  return res.status(200).json(await directService.schedule(direct));
});

// GET /api/orders/:orderId/directs - fulfillments.directs rows, VERBATIM.
export const getDirectsByOrder = asyncHandler(async (req, res) => {
  return res.json(await directService.forOrder(req.params.orderId));
});
