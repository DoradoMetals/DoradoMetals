import * as taxService from "../services/taxService.js";

export async function getSalesTax(req, res, next) {
  try {
    const tax = await taxService.getSalesTax(req.body);
    return res.json(tax);
  } catch (err) {
    return next(err);
  }
}
