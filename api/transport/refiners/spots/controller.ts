import { uuidParam } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as refinerSpotsService from "#domain/refiners/spots/service.ts";

// GET /api/orders/:orderId/refiners/spots — the refinery's quoted spots, by the customer order id. A missing engagement is a 404; an engagement with no quotes answers [].
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
