import * as rateService from "../services/rateService.js";

export async function getOne(req, res, next) {
  try {
    const rate = await rateService.getRate(req.query.rate_id);
    return res.status(200).json(rate);
  } catch (err) {
    return next(err);
  }
}

export async function getAll(req, res, next) {
  try {
    const rates = await rateService.getAllRates();
    return res.status(200).json(rates);
  } catch (err) {
    return next(err);
  }
}

export async function getAdmin(req, res, next) {
  try {
    const rates = await rateService.getAdminRates();
    return res.status(200).json(rates);
  } catch (err) {
    return next(err);
  }
}

export async function createRate(req, res, next) {
  try {
    const rate = await rateService.createRate(req.body.rate, req.body.user_name);
    return res.status(200).json(rate);
  } catch (err) {
    return next(err);
  }
}

export async function updateRate(req, res, next) {
  try {
    const rate = await rateService.updateRate(req.body.rate, req.body.user_name);
    return res.status(200).json(rate);
  } catch (err) {
    return next(err);
  }
}

export async function deleteRate(req, res, next) {
  try {
    const result = await rateService.deleteRate(req.body.rate_id);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}
