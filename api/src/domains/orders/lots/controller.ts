import { z } from 'zod/v4'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { strictBody, uuidParam } from '#shared/http/validate.ts'
import * as orders from '#orders/service.ts'
import { OrderLotLine, OrderLotPatch } from '@dorado/contracts'

const CreateOrderLotBody = z.union([OrderLotLine, OrderLotPatch])

export const getOrderLots = asyncHandler(async (req, res) => {
  return res.json(await orders.lotsFor(uuidParam(req, 'id')))
})

export const createOrderLot = asyncHandler(async (req, res) => {
  const input = strictBody(CreateOrderLotBody, req.body)
  const order_id = uuidParam(req, 'id')
  const written =
    'lot_id' in input
      ? await orders.assignStockLot(order_id, input.lot_id)
      : await orders.addLot(order_id, input)
  return res.status(201).json(written)
})

export const patchOrderLot = asyncHandler(async (req, res) => {
  const changes = strictBody(OrderLotPatch, req.body)
  return res.json(await orders.editLot(uuidParam(req, 'id'), changes))
})

export const deleteOrderLot = asyncHandler(async (req, res) => {
  await orders.removeLot(uuidParam(req, 'id'))
  return res.status(204).end()
})
