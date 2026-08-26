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

  // READY DATE IS A Date EVERYWHERE BELOW, AND JSON CANNOT CARRY ONE.
  //
  // The provider takes it twice - pickupAvailabilityPayload calls
  // formatFedexTime(d), which reads d.getHours(), and parsePickupAvailability
  // calls d.getTime() - and both were handed the raw string from the body. The
  // frontend sends `new Date().toISOString().split("T")[0]`, so this route
  // answered 500 with "d.getHours is not a function" on every call.
  //
  // Converted here because this is the boundary where a request becomes
  // objects; the provider's Date is the type it always meant.
  const readyAt = new Date(readyDate);
  if (Number.isNaN(readyAt.getTime())) {
    const err: Error & { statusCode?: number } = new Error(
      "readyDate is required and must be a date"
    );
    err.statusCode = 400;
    throw err;
  }
  const result = await shippingHandler.checkPickup(carrier_id, null, {
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
