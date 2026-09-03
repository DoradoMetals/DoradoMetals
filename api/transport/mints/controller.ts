import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as mintService from "#domain/mints/service.ts";

export const getAllMints = asyncHandler(async (req, res) => {
  res.status(200).json(await mintService.getAllMints());
});
