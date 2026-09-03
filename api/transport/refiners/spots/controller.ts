import { param } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as refinerSpotsService from "#domain/refiners/spots/service.ts";

// GET /api/orders/:orderId/refiners/spots - the refinery's quoted spots, by
// the customer order id. Replaces get_purchase_order_refiner_metals. A missing
// engagement is a 404; an engagement with no quotes answers [].
export const getRefinerSpotsByOrder = asyncHandler(async (req, res) => {
  const spots = await refinerSpotsService.forOrder(param(req, "orderId"));
  if (spots === null) {
    return res.status(404).json({
      error: "Not Found",
      message: `order ${param(req, "orderId")} has no refiner engagement`,
    });
  }
  return res.json(spots);
});
