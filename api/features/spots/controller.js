// Responses go out through toWire, which renames the new schema's name/ask/bid
// back to the type/ask_spot/bid_spot the frontend reads. SPOTS_WIRE=next turns
// it off.
import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as spotService from "#features/spots/service.js";
import { toWire } from "#features/spots/wire.js";

export const getSpotPrices = asyncHandler(async (req, res) => {
  const spots = await spotService.getSpotPrices();
  res.status(200).json(toWire(spots));
});

export const getAllMetals = asyncHandler(async (req, res) => {
  res.status(200).json(toWire(await spotService.getAllMetals()));
});
