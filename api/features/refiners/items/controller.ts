import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as refinerItemsService from "#features/refiners/items/service.ts";

export const patchRefinerItem = asyncHandler(async (req, res) => {
  const result = await refinerItemsService.patchRefinerItem(req.params.orderItemId, req.body ?? {});
  return res.status(200).json(result);
});
