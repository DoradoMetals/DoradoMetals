import * as taxService from "#features/sales-tax/service.js"

export async function getSalesTax(req, res, next) {
  try {
    const tax = await taxService.getSalesTax(req.body);
    return res.json(tax);
  } catch (err) {
    return next(err);
  }
}
