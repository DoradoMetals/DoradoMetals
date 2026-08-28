import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as refinerOrdersService from "#features/refiners/orders/service.ts";

export const patchRefinerOrder = asyncHandler(async (req, res) => {
  const engagement = await refinerOrdersService.patchRefinerOrder(req.params.id, req.body ?? {});
  return res.status(200).json(engagement);
});
