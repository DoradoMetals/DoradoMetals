import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { parseStrict, strictBody } from '#shared/http/validate.ts'
import { oneString } from '#shared/http/query.ts'
import { param } from '#shared/http/caller.ts'
import * as spotService from '#pricing/spots/service.ts'
import {
  ActiveSpotSourcePatch,
  SpotAdjustmentPatch,
  SpotHistoryDays,
  SpotSettingsPatch,
  SpotSourcePatch,
} from '@dorado/contracts'

export const listSpots = asyncHandler(async (_req, res) => {
  res.status(200).json(await spotService.listTicker())
})

export const refreshSpots = asyncHandler(async (_req, res) => {
  res.status(200).json(await spotService.refresh())
})

export const listLocks = asyncHandler(async (_req, res) => {
  res.status(200).json(await spotService.listLocks())
})

export const listSources = asyncHandler(async (_req, res) => {
  res.status(200).json(await spotService.listSources())
})

export const updateSource = asyncHandler(async (req, res) => {
  const patch = strictBody(SpotSourcePatch.strict(), req.body)
  res.status(200).json(await spotService.updateSource(param(req, 'id'), patch))
})

export const listActiveSources = asyncHandler(async (_req, res) => {
  res.status(200).json(await spotService.listActiveSources())
})

export const setActiveSource = asyncHandler(async (req, res) => {
  const patch = strictBody(ActiveSpotSourcePatch.strict(), req.body)
  res.status(200).json(await spotService.setActiveSource(param(req, 'metal_id'), patch))
})

export const listAdjustments = asyncHandler(async (_req, res) => {
  res.status(200).json(await spotService.listAdjustments())
})

export const listAdjustmentHistory = asyncHandler(async (req, res) => {
  const days = parseStrict(SpotHistoryDays, oneString(req.query.days) ?? undefined, 'days')
  res
    .status(200)
    .json(await spotService.listAdjustmentHistory(days, oneString(req.query.metal_id) ?? null))
})

export const setAdjustment = asyncHandler(async (req, res) => {
  const patch = strictBody(SpotAdjustmentPatch.strict(), req.body)
  res
    .status(200)
    .json(await spotService.setAdjustment(param(req, 'metal_id'), param(req, 'source_id'), patch))
})

export const removeAdjustment = asyncHandler(async (req, res) => {
  await spotService.removeAdjustment(param(req, 'metal_id'), param(req, 'source_id'))
  res.status(204).end()
})

export const getSettings = asyncHandler(async (_req, res) => {
  res.status(200).json(await spotService.getSettings())
})

export const updateSettings = asyncHandler(async (req, res) => {
  const patch = strictBody(SpotSettingsPatch.strict(), req.body)
  res.status(200).json(await spotService.updateSettings(patch))
})
