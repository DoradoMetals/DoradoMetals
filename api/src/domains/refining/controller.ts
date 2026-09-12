import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { refuseWith } from '#shared/http/refuse.ts'
import { strictBody, uuidParam } from '#shared/http/validate.ts'
import * as refining from '#refining/service.ts'
import {
  PoolEntryKind,
  PoolLockCreate,
  RefiningBatch,
  RefiningDirection,
  RefiningLotPatch,
  RefiningLotsBody,
  RefiningOrderCreate,
  RefiningOrderPatch,
  RefiningSettlement,
  RefiningSupply,
} from '@dorado/contracts'
import type { Request } from 'express'

const STATES = ['Pending assay', 'Settled', 'Disputed', 'Cancelled']

const named = (req: Request, key: string): string | null =>
  typeof req.query[key] === 'string' ? (req.query[key] as string) : null

export const listRefiningOrders = asyncHandler(async (req, res) => {
  const direction = named(req, 'direction')
  if (direction !== null && !RefiningDirection.safeParse(direction).success) {
    refuseWith(400, `"direction" is ${RefiningDirection.options.join(' or ')}`)
  }
  const state = named(req, 'state')
  if (state !== null && !STATES.includes(state)) {
    refuseWith(400, `"state" is one of ${STATES.join(', ')}`)
  }
  return res.json(
    await refining.list(named(req, 'refiner_id'), direction as never, state)
  )
})

export const getRefiningOrder = asyncHandler(async (req, res) => {
  return res.json(await refining.view(uuidParam(req, 'id')))
})

export const createRefiningOrder = asyncHandler(async (req, res) => {
  return res.status(201).json(await refining.create(strictBody(RefiningOrderCreate, req.body)))
})

export const batchRefiningOrders = asyncHandler(async (req, res) => {
  return res.status(201).json(await refining.batch(strictBody(RefiningBatch, req.body)))
})

export const patchRefiningOrder = asyncHandler(async (req, res) => {
  const changes = strictBody(RefiningOrderPatch, req.body)
  return res.json(await refining.patch(uuidParam(req, 'id'), changes))
})

export const sendRefiningOrder = asyncHandler(async (req, res) => {
  return res.json(await refining.send(uuidParam(req, 'id')))
})

export const settleRefiningOrder = asyncHandler(async (req, res) => {
  const body = strictBody(RefiningSettlement, req.body)
  return res.json(await refining.settle(uuidParam(req, 'id'), body))
})

export const cancelRefiningOrder = asyncHandler(async (req, res) => {
  return res.json(await refining.cancel(uuidParam(req, 'id')))
})

export const getRefiningSpots = asyncHandler(async (req, res) => {
  return res.json(await refining.spotsFor(uuidParam(req, 'id')))
})

export const getRefiningDocuments = asyncHandler(async (req, res) => {
  return res.json(await refining.documentsFor(uuidParam(req, 'id')))
})

export const sellToRefiner = asyncHandler(async (req, res) => {
  const { refiner_id } = strictBody(RefiningSupply, req.body)
  return res.status(201).json(await refining.sellToRefiner(uuidParam(req, 'id'), refiner_id))
})

export const getRefiningLots = asyncHandler(async (req, res) => {
  return res.json(await refining.lotsFor(uuidParam(req, 'id')))
})

export const assignRefiningLots = asyncHandler(async (req, res) => {
  const { lot_ids } = strictBody(RefiningLotsBody, req.body)
  return res.status(201).json(await refining.assignLots(uuidParam(req, 'id'), lot_ids))
})

export const patchRefiningLot = asyncHandler(async (req, res) => {
  const changes = strictBody(RefiningLotPatch, req.body)
  return res.json(await refining.recordAssay(uuidParam(req, 'id'), changes))
})

export const deleteRefiningLot = asyncHandler(async (req, res) => {
  await refining.removeLot(uuidParam(req, 'id'))
  return res.status(204).end()
})

export const getPoolBalances = asyncHandler(async (req, res) => {
  return res.json(await refining.balances(named(req, 'refiner_id'), named(req, 'metal_id')))
})

export const getPoolEntries = asyncHandler(async (req, res) => {
  const entry = named(req, 'entry')
  if (entry !== null && !PoolEntryKind.safeParse(entry).success) {
    refuseWith(400, `"entry" is ${PoolEntryKind.options.join(' or ')}`)
  }
  return res.json(
    await refining.entries(named(req, 'refiner_id'), named(req, 'metal_id'), entry as never)
  )
})

export const createPoolLock = asyncHandler(async (req, res) => {
  return res.status(201).json(await refining.lockFromPool(strictBody(PoolLockCreate, req.body)))
})

export const getAllRefiners = asyncHandler(async (_req, res) => {
  return res.json(await refining.allRefiners())
})

export const supplyOrder = asyncHandler(async (req, res) => {
  const { refiner_id } = strictBody(RefiningSupply, req.body)
  return res.status(201).json(await refining.supplyOrder(uuidParam(req, 'id'), refiner_id))
})
