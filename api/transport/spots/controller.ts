import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as spotService from "#domain/spots/service.ts";

export const getSpotPrices = asyncHandler(async (req, res) => {
  const spots = await spotService.getSpotPrices();
  res.status(200).json(spots);
});

export const getAllMetals = asyncHandler(async (req, res) => {
  res.status(200).json(await spotService.getAllMetals());
});
