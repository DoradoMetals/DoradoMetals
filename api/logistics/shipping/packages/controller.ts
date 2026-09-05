import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as packagesService from "#logistics/shipping/packages/service.ts";

export const getOffered = asyncHandler(async (_req, res) => {
  const result = await packagesService.getOffered();
  return res.status(200).json(result);
});
