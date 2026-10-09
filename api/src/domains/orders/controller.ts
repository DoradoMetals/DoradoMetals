import { callerId } from '#shared/http/caller.ts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { refuseWith } from '#shared/http/refuse.ts'
import { strictBody, uuidParam } from '#shared/http/validate.ts'
import { manyStrings, oneString } from '#shared/http/query.ts'
import * as orders from '#orders/service.ts'
import * as orderRead from '#orders/read.ts'
import * as rules from '#orders/rules.ts'
import * as place from '#orders/place.ts'
import * as checkoutService from '#checkout/service.ts'
import { Forbidden, NotFound } from '#shared/errors.ts'
import {
  AdminOrderCreate,
  AdoptAssayBody,
  OrderCancelBody,
  OrderCreateBody,
  OrderPatch,
  OrderState,
  OverrideBody,
} from '@dorado/contracts'
import type { OrderState as State } from '@dorado/contracts'
import type { Request } from 'express'

const UNASSIGNED = 'unassigned'

const statesIn = (req: Request): State[] | null => {
  const raw = manyStrings(req.query.state)
  if (raw === null) return null
  for (const value of raw) {
    if (!OrderState.safeParse(value).success) {
      refuseWith(400, `"state" is one of ${OrderState.options.join(', ')}`)
    }
  }
  return raw as State[]
}

const countIn = (req: Request, key: string): number | null => {
  const raw = oneString(req.query[key])
  if (raw === undefined) return null
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) refuseWith(400, `"${key}" is a whole number`)
  return value
}

export const listOrders = asyncHandler(async (req, res) => {
  const callerIdValue = callerId(req)
  const isAdmin = req.user?.role === 'admin'

  const direction = typeof req.query.direction === 'string' ? req.query.direction : null
  if (direction !== null && direction !== 'purchase' && direction !== 'sale') {
    refuseWith(400, `"direction" is "purchase" or "sale"`)
  }

  const namedUser = isAdmin && typeof req.query.user_id === 'string' ? req.query.user_id : null
  const user_id = isAdmin && !namedUser ? null : (namedUser ?? callerIdValue)
  const assigned = isAdmin ? (oneString(req.query.assigned_to_id) ?? null) : null

  const list = await orderRead.list({
    direction,
    user_id,
    states: statesIn(req),
    assigned_to_id: assigned === UNASSIGNED ? null : assigned,
    unassigned: assigned === UNASSIGNED ? true : null,
    has_unassigned_lots: oneString(req.query.has_unassigned_lots) === 'true' ? true : null,
    sort: oneString(req.query.sort) ?? null,
    limit: countIn(req, 'limit'),
    offset: countIn(req, 'offset'),
  })
  return res.json(isAdmin ? list : rules.orderListForCustomer(list))
})

export const listOrderSorts = asyncHandler(async (_req, res) => {
  return res.json(await orderRead.sorts())
})

export const searchEverything = asyncHandler(async (req, res) => {
  const q = oneString(req.query.q)?.trim() ?? ''
  if (q.length < 2) refuseWith(400, `"q" is at least two characters`)
  return res.json(await orderRead.search(q))
})

export const getOrder = asyncHandler(async (req, res) => {
  const id = uuidParam(req, 'id')
  const view = await orderRead.view(id)
  if (!view) throw new NotFound(`no order ${id}`)
  const isAdmin = req.user?.role === 'admin'
  return res.json(isAdmin ? view : rules.orderViewForCustomer(view))
})

export const patchOrder = asyncHandler(async (req, res) => {
  const changes = strictBody(OrderPatch, req.body)
  return res.status(200).json(await orders.patch(uuidParam(req, 'id'), changes))
})

export const createOrder = asyncHandler(async (req, res) => {
  const { checkout_id } = strictBody(OrderCreateBody, req.body)
  const checkout = await checkoutService.getRowById(checkout_id)
  if (!checkout) throw new NotFound(`no checkout ${checkout_id}`)
  if (checkout.user_id !== callerId(req) && req.user?.role !== 'admin') {
    throw new Forbidden(`checkout ${checkout_id} is not yours`)
  }
  return res.status(201).json(await place.place(checkout_id))
})

export const adminCreateOrder = asyncHandler(async (req, res) => {
  const body = strictBody(AdminOrderCreate, req.body)
  return res.status(201).json(await place.placeForAdmin(body))
})

export const addFundsToOrder = asyncHandler(async (req, res) => {
  const body = strictBody(OverrideBody, req.body ?? {})
  return res
    .status(200)
    .json(await orders.addFunds(uuidParam(req, 'id'), body, req.sessionId ?? null))
})

export const finalizeOrder = asyncHandler(async (req, res) => {
  return res.status(200).json(await orders.finalize(uuidParam(req, 'id')))
})

export const getOrderDocuments = asyncHandler(async (req, res) => {
  return res.json(await orders.documentsFor(uuidParam(req, 'id')))
})

export const cancelOrder = asyncHandler(async (req, res) => {
  const input = strictBody(OrderCancelBody, req.body)
  return res.status(200).json(await orders.cancel(uuidParam(req, 'id'), input))
})

export const getAdoptAssayProposal = asyncHandler(async (req, res) => {
  return res.json(await orders.adoptAssayProposal(uuidParam(req, 'id')))
})

export const adoptAssay = asyncHandler(async (req, res) => {
  const body = strictBody(AdoptAssayBody, req.body)
  return res.status(200).json(await orders.adoptAssay(uuidParam(req, 'id'), body))
})
