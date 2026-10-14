import { RateBandsBody, RateChangeFilter, RatePayQuery } from '@dorado/contracts'
import { parseStrict, strictBody, uuidParam } from '#shared/http/validate.ts'
import { param } from '#shared/http/caller.ts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as rateService from '#pricing/rates/service.ts'

export const listPay = asyncHandler(async (req, res) => {
  const { unit } = parseStrict(RatePayQuery.strict(), req.query, 'query')
  res.status(200).json(await rateService.listPay(unit))
})

export const listTiers = asyncHandler(async (_req, res) => {
  res.status(200).json(await rateService.listTiers())
})

export const listAdminRates = asyncHandler(async (_req, res) => {
  res.status(200).json(await rateService.listAdminRates())
})

export const getRate = asyncHandler(async (req, res) => {
  res.status(200).json(await rateService.getRate(uuidParam(req, 'id')))
})

export const replaceBands = asyncHandler(async (req, res) => {
  const body = strictBody(RateBandsBody.strict(), req.body)
  const { unit } = parseStrict(RatePayQuery.strict(), req.query, 'query')
  res.status(200).json(await rateService.replaceBands(param(req, 'metal_id'), body, unit))
})

export const listChanges = asyncHandler(async (req, res) => {
  const filter = parseStrict(RateChangeFilter.strict(), req.query, 'query')
  res.status(200).json(await rateService.listChanges(filter))
})
