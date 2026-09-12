import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { refuseWith } from '#shared/http/refuse.ts'
import { strictBody, uuidParam } from '#shared/http/validate.ts'
import { oneString, manyStrings } from '#shared/http/query.ts'
import * as inventory from '#inventory/service.ts'
import { LotCombine, LotKind, LotSplit, Position } from '@dorado/contracts'
import type { Request } from 'express'

const positionsIn = (req: Request): Position[] | null => {
  const raw = manyStrings(req.query.position)
  if (raw === null) return null
  for (const value of raw) {
    if (!Position.safeParse(value).success) {
      refuseWith(400, `"position" is one of ${Position.options.join(', ')}`)
    }
  }
  return raw as Position[]
}

const kindIn = (req: Request): LotKind | null => {
  const raw = oneString(req.query.kind) ?? null
  if (raw === null) return null
  if (!LotKind.safeParse(raw).success) {
    refuseWith(400, `"kind" is ${LotKind.options.join(' or ')}`)
  }
  return raw as LotKind
}

export const listLots = asyncHandler(async (req, res) => {
  return res.json(
    await inventory.list({
      positions: positionsIn(req),
      metal_id: oneString(req.query.metal_id) ?? null,
      kind: kindIn(req),
      order_id: oneString(req.query.order_id) ?? null,
      refiner_id: oneString(req.query.refiner_id) ?? null,
      q: oneString(req.query.q) ?? null,
      unassigned: oneString(req.query.unassigned) === 'true' ? true : null,
    })
  )
})

export const getLot = asyncHandler(async (req, res) => {
  return res.json(await inventory.detail(uuidParam(req, 'id')))
})

export const combineLots = asyncHandler(async (req, res) => {
  const { lot_ids } = strictBody(LotCombine, req.body)
  return res.status(201).json(await inventory.combine(lot_ids))
})

export const splitOrderLot = asyncHandler(async (req, res) => {
  const { parts } = strictBody(LotSplit, req.body)
  return res.status(201).json(await inventory.split(uuidParam(req, 'id'), parts))
})

export const getInventorySummary = asyncHandler(async (_req, res) => {
  return res.json(await inventory.summary())
})
