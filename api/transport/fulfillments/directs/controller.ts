import { param } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as directService from "#domain/fulfillments/directs/service.ts";

export const scheduleDirect = asyncHandler(async (req, res) => {
  const { direct } = req.body;
  return res.status(200).json(await directService.schedule(direct));
});

// GET /api/orders/:orderId/directs - fulfillments.directs rows, VERBATIM.
export const getDirectsByOrder = asyncHandler(async (req, res) => {
  return res.json(await directService.forOrder(param(req, "orderId")));
});
