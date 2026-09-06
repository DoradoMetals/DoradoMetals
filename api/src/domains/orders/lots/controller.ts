import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { strictBody, uuidParam } from '#shared/http/validate.ts'
import { oneString } from '#shared/http/query.ts'
import * as orders from '#orders/service.ts'
import { LotSplit, OrderLotPatch } from '@dorado/contracts'

// The Adding Lot autocomplete. `unassigned=true` is the batching case: lots no
// refiner order holds yet.
export const searchLots = asyncHandler(async (req, res) => {
  return res.json(
    await orders.searchLots(oneString(req.query.q) ?? null, oneString(req.query.unassigned) === 'true')
  )
})

export const getOrderLots = asyncHandler(async (req, res) => {
  return res.json(await orders.lotsFor(uuidParam(req, 'id')))
})

export const createOrderLot = asyncHandler(async (req, res) => {
  const input = strictBody(OrderLotPatch, req.body)
  return res.status(201).json(await orders.addLot(uuidParam(req, 'id'), input))
})

export const patchOrderLot = asyncHandler(async (req, res) => {
  const changes = strictBody(OrderLotPatch, req.body)
  return res.json(await orders.editLot(uuidParam(req, 'id'), changes))
})

export const deleteOrderLot = asyncHandler(async (req, res) => {
  await orders.removeLot(uuidParam(req, 'id'))
  return res.status(204).end()
})

export const splitOrderLot = asyncHandler(async (req, res) => {
  const { parts } = strictBody(LotSplit, req.body)
  return res.status(201).json(await orders.splitLot(uuidParam(req, 'id'), parts))
})
