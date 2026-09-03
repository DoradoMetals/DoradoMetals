import { callerId, requiredParam } from "#shared/http/caller.ts";
import { oneString } from "#shared/http/query.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as rateService from "#domain/rates/service.ts"

export const getOne = asyncHandler(async (req, res) => {
  const rate = await rateService.getRate(requiredParam(req.query.rate_id, "rate_id"));
  return res.status(200).json(rate);
});

export const getAll = asyncHandler(async (req, res) => {
  const rates = await rateService.getAllRates();
  return res.status(200).json(rates);
});

export const getAdmin = asyncHandler(async (req, res) => {
  const rates = await rateService.getAdminRates();
  return res.status(200).json(rates);
});

export const createRate = asyncHandler(async (req, res) => {
  const rate = await rateService.createRate(req.body.rate, req.body.user_name);
  return res.status(200).json(rate);
});

export const updateRate = asyncHandler(async (req, res) => {
  const rate = await rateService.updateRate(req.body.rate, req.body.user_name);
  return res.status(200).json(rate);
});

export const deleteRate = asyncHandler(async (req, res) => {
  const result = await rateService.deleteRate(req.body.rate_id);
  return res.status(200).json(result);
});
