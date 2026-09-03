import { shipping } from "@dorado/contracts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { parseStrict } from "#shared/http/validate.ts";
import * as operationsService from "#domain/shipping/operations/service.ts";

// Every body below is ids for what the server holds plus genuinely new
// numbers (D214 item 11) - parsed strictly here, once, before the use case
// runs. carrier_id is optional on every operation: a caller that names one
// still gets that one; the server resolves a default otherwise.

export const validateAddress = asyncHandler(async (req, res) => {
  const body = parseStrict(shipping.shipments.ValidateAddressBody, req.body, "shipping/validate_address body");
  res.json(await operationsService.validateAddress(body));
});

export const getRates = asyncHandler(async (req, res) => {
  const body = parseStrict(shipping.shipments.RatesBody, req.body, "shipping/get_rates body");
  res.json(await operationsService.getRates(body));
});

export const checkPickup = asyncHandler(async (req, res) => {
  const body = parseStrict(shipping.pickups.CheckBody, req.body, "shipping/check_pickup body");
  res.json(await operationsService.checkPickup(body));
});

export const getTracking = asyncHandler(async (req, res) => {
  const body = parseStrict(shipping.tracking.Body, req.body, "shipping/get_tracking body");
  res.json(await operationsService.getTracking(body.shipment_id));
});

export const getLocations = asyncHandler(async (req, res) => {
  const body = parseStrict(shipping.shipments.LocationsBody, req.body, "shipping/get_locations body");
  res.json(await operationsService.getLocations(body));
});

export const cancelLabel = asyncHandler(async (req, res) => {
  const body = parseStrict(shipping.shipments.CancelBody, req.body, "shipping/cancel_label body");
  res.json(await operationsService.cancelLabel(body));
});

export const cancelPickup = asyncHandler(async (req, res) => {
  const body = parseStrict(shipping.pickups.CancelBody, req.body, "shipping/cancel_pickup body");
  res.json(await operationsService.cancelPickup(body));
});
