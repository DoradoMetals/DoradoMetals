import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { strictBody } from '#shared/http/validate.ts'
import { param } from '#shared/http/caller.ts'
import * as spotService from '#pricing/spots/service.ts'
import { SpotOverridePatch, SpotSettingsPatch } from '@dorado/contracts'

export const listSpots = asyncHandler(async (_req, res) => {
  res.status(200).json(await spotService.listTicker())
})

export const listLocks = asyncHandler(async (_req, res) => {
  res.status(200).json(await spotService.listLocks())
})

export const setOverride = asyncHandler(async (req, res) => {
  const patch = strictBody(SpotOverridePatch.strict(), req.body)
  res.status(200).json(await spotService.setOverride(param(req, 'metal_id'), patch))
})

export const removeOverride = asyncHandler(async (req, res) => {
  await spotService.removeOverride(param(req, 'metal_id'))
  res.status(204).end()
})

export const getSettings = asyncHandler(async (_req, res) => {
  res.status(200).json(await spotService.getSettings())
})

export const updateSettings = asyncHandler(async (req, res) => {
  const patch = strictBody(SpotSettingsPatch.strict(), req.body)
  res.status(200).json(await spotService.updateSettings(patch))
})
