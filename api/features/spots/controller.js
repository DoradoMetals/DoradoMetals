import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as spotService from "#features/spots/service.js";

export const getSpotPrices = asyncHandler(async (req, res) => {
  const spots = await spotService.getSpotPrices();
  res.status(200).json(spots);
});

export const getAllMetals = asyncHandler(async (req, res) => {
  res.status(200).json(await spotService.getAllMetals());
});
