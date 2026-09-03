// The order's frozen spots. The PUT document is checked by the resource's own
// refusedField, which names the offending field.
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { uuidParam } from "#shared/http/validate.ts";
import * as orderSpotsService from "#domain/orders/spots/service.ts";

export const getOrderSpots = asyncHandler(async (req, res) => {
  return res.json(await orderSpotsService.rowsFor(uuidParam(req, "id")));
});

export const putOrderSpots = asyncHandler(async (req, res) => {
  const updated = await orderSpotsService.setSpots(uuidParam(req, "id"), req.body ?? {});
  return res.status(200).json(updated);
});
