import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as refinerService from "#domain/refiners/service.ts"

export const getAllRefiners = asyncHandler(async (req, res) => {
  const refiners = await refinerService.getAllRefiners();
  return res.json(refiners);
});
