import { param } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as refinerOrdersService from "#features/refiners/orders/service.ts";

export const patchRefinerOrder = asyncHandler(async (req, res) => {
  const engagement = await refinerOrdersService.patchRefinerOrder(param(req, "id"), req.body ?? {});
  return res.status(200).json(engagement);
});

// GET /api/orders/:orderId/refiners - the BARE engagement row for a customer
// order, mounted from the orders routes (reads resolve from the parent path).
// The row's own id is how PATCH /refiners/orders/:id gets its key; the order
// id is the key every component already holds.
export const getRefinerOrderByOrder = asyncHandler(async (req, res) => {
  const engagement = await refinerOrdersService.getByOrder(param(req, "orderId"));
  if (!engagement) {
    return res.status(404).json({
      error: "Not Found",
      message: `order ${param(req, "orderId")} has no refiner engagement`,
    });
  }
  return res.json(engagement);
});

// GET /api/orders/:orderId/refiners/spots MOVED to
// features/refiners/spots/controller.ts (ruling 26c - the handler lives with
// the table it reads). The path is unchanged and still declared by
// features/orders/routes.ts.

// GET /api/orders/:orderId/refiners/items MOVED to
// features/refiners/items/controller.ts (ruling 26c). The path is unchanged.
