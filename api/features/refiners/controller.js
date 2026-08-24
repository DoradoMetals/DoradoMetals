import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as refinerService from "#features/refiners/service.js"

export const getAllRefiners = asyncHandler(async (req, res) => {
  const refiners = await refinerService.getAllRefiners();
  return res.json(refiners);
});
