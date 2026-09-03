import {
  ShippingCancelLabelBody, ShippingCancelPickupBody, ShippingCheckPickupBody,
  ShippingGetLocationsBody, ShippingGetRatesBody, ShippingGetTrackingBody,
  ShippingValidateAddressBody,
} from "@dorado/contracts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { parseStrict } from "#shared/http/validate.ts";
import * as operationsService from "#domain/shipping/operations/service.ts";

// Every body below is ids for what the server holds plus genuinely new
// numbers (D214 item 11) - parsed strictly here, once, before the use case
// runs. carrier_id is optional on every operation: a caller that names one
// still gets that one; the server resolves a default otherwise.

export const validateAddress = asyncHandler(async (req, res) => {
  const body = parseStrict(ShippingValidateAddressBody, req.body, "shipping/validate_address body");
  res.json(await operationsService.validateAddress(body));
});

export const getRates = asyncHandler(async (req, res) => {
  const body = parseStrict(ShippingGetRatesBody, req.body, "shipping/get_rates body");
  res.json(await operationsService.getRates(body));
});

export const checkPickup = asyncHandler(async (req, res) => {
  const body = parseStrict(ShippingCheckPickupBody, req.body, "shipping/check_pickup body");
  res.json(await operationsService.checkPickup(body));
});

export const getTracking = asyncHandler(async (req, res) => {
  const body = parseStrict(ShippingGetTrackingBody, req.body, "shipping/get_tracking body");
  res.json(await operationsService.getTracking(body.shipment_id));
});

export const getLocations = asyncHandler(async (req, res) => {
  const body = parseStrict(ShippingGetLocationsBody, req.body, "shipping/get_locations body");
  res.json(await operationsService.getLocations(body));
});

export const cancelLabel = asyncHandler(async (req, res) => {
  const body = parseStrict(ShippingCancelLabelBody, req.body, "shipping/cancel_label body");
  res.json(await operationsService.cancelLabel(body));
});

export const cancelPickup = asyncHandler(async (req, res) => {
  const body = parseStrict(ShippingCancelPickupBody, req.body, "shipping/cancel_pickup body");
  res.json(await operationsService.cancelPickup(body));
});
