import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { parseStrict, strictBody, uuidParam } from '#shared/http/validate.ts'
import { oneString } from '#shared/http/query.ts'
import { param } from '#shared/http/caller.ts'
import * as spotService from '#pricing/spots/service.ts'
import {
  ActiveSpotSourcePatch,
  SpotActivityDays,
  SpotAdjustmentPatch,
  SpotCandleQuery,
  SpotFreezeBody,
  SpotHistoryDays,
  SpotLockFilter,
  SpotSettingsPatch,
  SpotSourcePatch,
  SpotStreamEventName,
} from '@dorado/contracts'

export const listSpots = asyncHandler(async (_req, res) => {
  res.status(200).json(await spotService.board())
})

export const HEARTBEAT_MS = 20_000

export const streamSpots = asyncHandler(async (req, res) => {
  const first = JSON.stringify(await spotService.board())
  res.status(200).set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders()
  const send = (board: string) => {
    res.write(`event: ${SpotStreamEventName.enum.board}\ndata: ${board}\n\n`)
  }
  send(first)
  const stop = spotService.watchBoard(send)
  const beat = setInterval(() => res.write(': heartbeat\n\n'), HEARTBEAT_MS)
  req.on('close', () => {
    clearInterval(beat)
    stop()
  })
})

export const metalCandles = asyncHandler(async (req, res) => {
  const filter = parseStrict(SpotCandleQuery.strict(), req.query, 'query')
  res.status(200).json(await spotService.candlesFor(param(req, 'metal_id'), filter))
})

export const refreshSpots = asyncHandler(async (_req, res) => {
  res.status(200).json(await spotService.refresh())
})

export const freezeAll = asyncHandler(async (req, res) => {
  const body = strictBody(SpotFreezeBody.strict(), req.body)
  res.status(200).json(await spotService.freezeAll(body))
})

export const listLocks = asyncHandler(async (req, res) => {
  const filter = parseStrict(SpotLockFilter.strict(), req.query, 'query')
  res.status(200).json(await spotService.listLocks(filter))
})

export const unlockLock = asyncHandler(async (req, res) => {
  res.status(200).json(await spotService.unlock(uuidParam(req, 'id')))
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

export const getMetal = asyncHandler(async (req, res) => {
  res.status(200).json(await spotService.getMetal(param(req, 'metal_id')))
})

export const setMetalSource = asyncHandler(async (req, res) => {
  const patch = strictBody(ActiveSpotSourcePatch.strict(), req.body)
  res.status(200).json(await spotService.setMetalSource(param(req, 'metal_id'), patch))
})

export const metalActivity = asyncHandler(async (req, res) => {
  const days = parseStrict(SpotActivityDays, oneString(req.query.days) ?? undefined, 'days')
  res.status(200).json(await spotService.metalActivity(param(req, 'metal_id'), days))
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

export const cancelAdjustment = asyncHandler(async (req, res) => {
  await spotService.cancelAdjustment(param(req, 'metal_id'))
  res.status(204).end()
})

export const getSettings = asyncHandler(async (_req, res) => {
  res.status(200).json(await spotService.getSettings())
})

export const updateSettings = asyncHandler(async (req, res) => {
  const patch = strictBody(SpotSettingsPatch.strict(), req.body)
  res.status(200).json(await spotService.updateSettings(patch))
})
