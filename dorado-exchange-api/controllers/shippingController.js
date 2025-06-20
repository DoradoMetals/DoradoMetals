const shippingService = require("../services/shippingService");

async function getTracking(req, res, next) {
  try {
    const tracking = await shippingService.getTracking(req.body);
    res.json(tracking);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getTracking,
};
