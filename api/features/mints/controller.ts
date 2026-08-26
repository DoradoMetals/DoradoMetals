import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as mintService from "#features/mints/service.ts";

export const getAllMints = asyncHandler(async (req, res) => {
  res.status(200).json(await mintService.getAllMints());
});
