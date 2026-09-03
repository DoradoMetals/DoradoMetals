import { param } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as orderSpotsService from "#domain/orders/spots/service.ts";

export const getOrderSpots = asyncHandler(async (req, res) => {
  return res.json(await orderSpotsService.rowsFor(param(req, "id")));
});

export const putOrderSpots = asyncHandler(async (req, res) => {
  return res.status(200).json(await orderSpotsService.put(param(req, "id"), req.body ?? {}));
});
