import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as tiersService from "#features/shipping/tiers/service.ts";

// GET /api/shipping/tiers
//
// Reference data the frontend maps against by `code` (ruling 12: rows out,
// ids in). Icons stay a client-side map beside the selector.
export const getTiers = asyncHandler(async (_req, res) => {
  const result = await tiersService.getTiers();
  return res.status(200).json(result);
});
