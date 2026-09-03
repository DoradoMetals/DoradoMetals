// The order's frozen spots. The PUT document parses strictly against the
// contract before the use case runs.
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { strictBody, uuidParam } from "#shared/http/validate.ts";
import * as orderSpotsService from "#domain/orders/spots/service.ts";
import { orders } from "@dorado/contracts";

export const getOrderSpots = asyncHandler(async (req, res) => {
  return res.json(await orderSpotsService.rowsFor(uuidParam(req, "id")));
});

export const putOrderSpots = asyncHandler(async (req, res) => {
  const body = strictBody(orders.spots.PutBody, req.body);
  return res.status(200).json(await orderSpotsService.setSpots(uuidParam(req, "id"), body));
});
