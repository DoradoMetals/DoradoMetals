import { uuidParam } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as directService from "#domain/fulfillments/directs/service.ts";

// No contract schema exists yet for a direct-schedule body.
export const scheduleDirect = asyncHandler(async (req, res) => {
  const { direct } = req.body;
  return res.status(200).json(await directService.schedule(direct));
});

// GET /api/orders/:orderId/directs - fulfillments.directs rows, VERBATIM.
export const getDirectsByOrder = asyncHandler(async (req, res) => {
  return res.json(await directService.forOrder(uuidParam(req, "orderId")));
});
