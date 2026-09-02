import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as packagesService from "#features/shipping/packages/service.ts";

// GET /api/shipping/packages - reference rows the client maps by `id`
// (ruling 12); icons stay a client-side map beside the selector.
export const getOffered = asyncHandler(async (_req, res) => {
  const result = await packagesService.getOffered();
  return res.status(200).json(result);
});
