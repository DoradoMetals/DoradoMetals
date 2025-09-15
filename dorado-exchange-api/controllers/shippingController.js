import * as shippingService from "../services/shippingService.js";

export async function getTracking(req, res, next) {
  try {
    const tracking = await shippingService.getTracking(req.body);
    res.json(tracking);
  } catch (err) {
    return next(err);
  }
}
