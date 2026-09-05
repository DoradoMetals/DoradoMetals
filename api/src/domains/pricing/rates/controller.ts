import { RatePatch } from '@dorado/contracts'
import { strictBody, uuidParam } from '#shared/http/validate.ts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as rateService from '#pricing/rates/service.ts'

export const listRates = asyncHandler(async (_req, res) => {
  res.status(200).json(await rateService.listRates())
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

export const createRate = asyncHandler(async (req, res) => {
  const patch = strictBody(RatePatch.strict(), req.body)
  res.status(201).json(await rateService.createRate(patch))
})

export const updateRate = asyncHandler(async (req, res) => {
  const patch = strictBody(RatePatch.strict(), req.body)
  res.status(200).json(await rateService.updateRate(uuidParam(req, 'id'), patch))
})

export const deleteRate = asyncHandler(async (req, res) => {
  await rateService.deleteRate(uuidParam(req, 'id'))
  res.status(204).end()
})
