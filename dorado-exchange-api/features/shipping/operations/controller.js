import * as operationsService from "#features/shipping/operations/service.js";
import * as shippingHandler from "#features/shipping/operations/handler.js";

export async function validateAddress(req, res, next) {
  try {
    const { carrier_id, address } = req.body;
    const result = await shippingHandler.validateAddress(carrier_id, null, {
      address,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getRates(req, res, next) {
  try {
    const result = await operationsService.getRates(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function checkPickup(req, res, next) {
  try {
    const { carrier_id, pickupAddress, code, readyDate } = req.body;

    const result = await shippingHandler.checkPickup(carrier_id, null, {
      pickupAddress,
      code,
      readyDate,
    });

    return res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getTracking(req, res, next) {
  try {
    const { shipment_id } = req.body
    const result = await operationsService.getTracking(shipment_id)
    return res.json(result)
  } catch (err) {
    next(err);
  }
}

export async function getLocations(req, res, next) {
  try {
    const { carrier_id, address, radius_miles, max_results } = req.body;

    const result = await shippingHandler.getLocations(carrier_id, null, {
      address,
      radiusMiles: radius_miles,
      maxResults: max_results,
    });

    return res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function cancelLabel(req, res, next) {
  try {
    const result = await operationsService.cancelLabel(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function cancelPickup(req, res, next) {
  try {
    const result = await operationsService.cancelPickup(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
