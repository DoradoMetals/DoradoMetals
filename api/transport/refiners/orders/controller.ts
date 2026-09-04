import { RefinerOrderPatch } from "@dorado/contracts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { parseStrict, uuidParam } from "#shared/http/validate.ts";
import * as refinerOrdersService from "#domain/refiners/orders/service.ts";

// PATCH /api/refiners/orders/:id - the id is a uuid and the body is a
// RefinerOrderPatch, parsed strictly before the service runs.
export const patchRefinerOrder = asyncHandler(async (req, res) => {
  const id = uuidParam(req, "id");
  const patch = parseStrict(RefinerOrderPatch, req.body ?? {}, "refiner order PATCH body");
  return res.status(200).json(await refinerOrdersService.patchRefinerOrder(id, patch));
});

// GET /api/orders/:orderId/refiners - the BARE engagement row for a customer
// order, mounted from the orders routes (reads resolve from the parent path).
export const getRefinerOrderByOrder = asyncHandler(async (req, res) => {
  const orderId = uuidParam(req, "orderId");
  const engagement = await refinerOrdersService.getByOrder(orderId);
  if (!engagement) {
    return res.status(404).json({
      error: "Not Found",
      message: `order ${orderId} has no refiner engagement`,
    });
  }
  return res.json(engagement);
});
