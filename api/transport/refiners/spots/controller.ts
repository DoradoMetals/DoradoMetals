import { uuidParam } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as refinerSpotsService from "#domain/refiners/spots/service.ts";

export const getRefinerSpotsByOrder = asyncHandler(async (req, res) => {
  const orderId = uuidParam(req, "orderId");
  const spots = await refinerSpotsService.forOrder(orderId);
  if (spots === null) {
    return res.status(404).json({
      error: "Not Found",
      message: `order ${orderId} has no refiner engagement`,
    });
  }
  return res.json(spots);
});
