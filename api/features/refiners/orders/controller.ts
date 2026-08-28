import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as refinerOrdersService from "#features/refiners/orders/service.ts";

export const patchRefinerOrder = asyncHandler(async (req, res) => {
  const engagement = await refinerOrdersService.patchRefinerOrder(req.params.id, req.body ?? {});
  return res.status(200).json(engagement);
});

// GET /api/orders/:orderId/refiners - the BARE engagement row for a customer
// order, mounted from the orders routes (reads resolve from the parent path).
// The row's own id is how PATCH /refiners/orders/:id gets its key; the order
// id is the key every component already holds.
export const getRefinerOrderByOrder = asyncHandler(async (req, res) => {
  const engagement = await refinerOrdersService.getByOrder(req.params.orderId);
  if (!engagement) {
    return res.status(404).json({
      error: "Not Found",
      message: `order ${req.params.orderId} has no refiner engagement`,
    });
  }
  return res.json(engagement);
});

// GET /api/orders/:orderId/refiners/spots - the refinery's quoted spots, by
// the same order-id key. Replaces get_purchase_order_refiner_metals. A
// missing engagement is a 404; an engagement with no quotes answers [].
export const getRefinerSpotsByOrder = asyncHandler(async (req, res) => {
  const spots = await refinerOrdersService.getSpotsByOrder(req.params.orderId);
  if (spots === null) {
    return res.status(404).json({
      error: "Not Found",
      message: `order ${req.params.orderId} has no refiner engagement`,
    });
  }
  return res.json(spots);
});
