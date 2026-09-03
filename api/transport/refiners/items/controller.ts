import { param } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as refinerItemsService from "#domain/refiners/items/service.ts";

export const patchRefinerItem = asyncHandler(async (req, res) => {
  const result = await refinerItemsService.patchRefinerItem(param(req, "orderItemId"), req.body ?? {});
  return res.status(200).json(result);
});

// GET /api/orders/:orderId/refiners/items - the path is declared by
// features/orders/routes.ts (the order id is the key the caller holds); the
// handler lives here because this feature owns the table. Admin-only: what the
// refinery reported decides what the business is paid.
export const getRefinerItemsByOrder = asyncHandler(async (req, res) => {
  return res.json(await refinerItemsService.forOrder(param(req, "orderId")));
});
