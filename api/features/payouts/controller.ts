import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as payoutsService from "#features/payouts/service.ts";

export const patchPayout = asyncHandler(async (req, res) => {
  const result = await payoutsService.patchPayout(req.params.id, req.body ?? {});
  return res.status(200).json(result);
});
