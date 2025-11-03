import * as rateService from "../services/rateService.js";

export async function getRates(req, res, next) {
  try {
    const rates = await rateService.getRates(req.body);
    res.json(rates);
  } catch (err) {
    return next(err);
  }
}
