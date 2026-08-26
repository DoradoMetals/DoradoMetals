import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as operationsService from "#features/shipping/operations/service.ts";
import * as shippingHandler from "#features/shipping/operations/handler.ts";

export const validateAddress = asyncHandler(async (req, res) => {
  const { carrier_id, address } = req.body;
  const result = await shippingHandler.validateAddress(carrier_id, null, { address });
  res.json(result);
});

export const getRates = asyncHandler(async (req, res) => {
  const result = await operationsService.getRates(req.body);
  res.json(result);
});

export const checkPickup = asyncHandler(async (req, res) => {
  const { carrier_id, pickupAddress, code, readyDate } = req.body;
  const result = await shippingHandler.checkPickup(carrier_id, null, {
    pickupAddress,
    code,
    readyDate,
  });
  return res.json(result);
});

export const getTracking = asyncHandler(async (req, res) => {
  const { shipment_id } = req.body;
  const result = await operationsService.getTracking(shipment_id);
  return res.json(result);
});

export const getLocations = asyncHandler(async (req, res) => {
  const { carrier_id, address, radius_miles, max_results } = req.body;
  const result = await shippingHandler.getLocations(carrier_id, null, {
    address,
    radiusMiles: radius_miles,
    maxResults: max_results,
  });
  return res.json(result);
});

export const cancelLabel = asyncHandler(async (req, res) => {
  const result = await operationsService.cancelLabel(req.body);
  res.json(result);
});

export const cancelPickup = asyncHandler(async (req, res) => {
  const result = await operationsService.cancelPickup(req.body);
  res.json(result);
});
