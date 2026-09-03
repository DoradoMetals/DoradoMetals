import { refiners } from "@dorado/contracts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { parseStrict, uuidParam } from "#shared/http/validate.ts";
import * as refinerItemsService from "#domain/refiners/items/service.ts";

// PATCH /api/refiners/items/by-order-item/:orderItemId - the orderItemId is a
// uuid and the body is a refiners.items.Patch, parsed strictly before the service
// runs. `content` is derived from post_melt and purity, so the contract has no
// such field and a strict parse refuses it by name.
export const patchRefinerItem = asyncHandler(async (req, res) => {
  const orderItemId = uuidParam(req, "orderItemId");
  const patch = parseStrict(refiners.items.Patch, req.body ?? {}, "refiner item PATCH body");
  return res.status(200).json(await refinerItemsService.patchRefinerItem(orderItemId, patch));
});

// GET /api/orders/:orderId/refiners/items - path declared by the orders routes
// (the order id is the key the caller holds); the handler lives here because
// this feature owns the table. Admin-only: what the refinery reported decides
// what the business is paid.
export const getRefinerItemsByOrder = asyncHandler(async (req, res) => {
  return res.json(await refinerItemsService.forOrder(uuidParam(req, "orderId")));
});
