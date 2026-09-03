import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as operationsService from "#domain/shipping/operations/service.ts";
import * as shippingHandler from "#domain/shipping/operations/handler.ts";
import { carrierIdOr } from "#domain/shipping/operations/resolver.ts";

// carrier_id is optional on every operation now - a caller that names one still gets that one; the server resolves a default otherwise (resolver.carrierIdOr).
export const validateAddress = asyncHandler(async (req, res) => {
  const { carrier_id, address } = req.body;
  const result = await shippingHandler.validateAddress(
    await carrierIdOr(carrier_id), null, { address }
  );
  res.json(result);
});

export const getRates = asyncHandler(async (req, res) => {
  const result = await operationsService.getRates(req.body);
  res.json(result);
});

export const checkPickup = asyncHandler(async (req, res) => {
  const { carrier_id, pickupAddress, code, readyDate } = req.body;

  // readyDate is a Date everywhere below, and JSON can't carry one - the provider calls getHours/getTime on it (pickupAvailabilityPayload, parsePickupAvailability), and the frontend sends a bare string, so this route answered 500 on every call.
  // Converted here, at the boundary where a request becomes objects - the provider's Date is the type it always meant.
  const readyAt = new Date(readyDate);
  if (Number.isNaN(readyAt.getTime())) {
    const err: Error & { statusCode?: number } = new Error(
      "readyDate is required and must be a date"
    );
    err.statusCode = 400;
    throw err;
  }
  const result = await shippingHandler.checkPickup(await carrierIdOr(carrier_id), null, {
    pickupAddress,
    code,
    readyDate: readyAt,
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
  const result = await shippingHandler.getLocations(await carrierIdOr(carrier_id), null, {
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
