import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as orderSpotsService from "#features/orders/spots/service.ts";

export const getOrderSpots = asyncHandler(async (req, res) => {
  return res.json(await orderSpotsService.rowsFor(req.params.id));
});

export const putOrderSpots = asyncHandler(async (req, res) => {
  return res.status(200).json(await orderSpotsService.put(req.params.id, req.body ?? {}));
});
