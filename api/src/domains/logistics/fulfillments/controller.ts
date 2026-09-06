import {
  FulfillmentCancelScheduleBody,
  FulfillmentCreateBody,
  FulfillmentPatchBody,
  FulfillmentSetMethodBody,
  FulfillmentSetStatusBody,
} from '@dorado/contracts'
import { uuidParam, parseStrict } from '#shared/http/validate.ts'
import { oneString } from '#shared/http/query.ts'
import { callerId } from '#shared/http/caller.ts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { requireFulfillmentOwner } from '#logistics/fulfillments/owner.ts'
import * as fulfillmentDrafts from '#logistics/fulfillments/drafts.ts'
import * as fulfillmentService from '#logistics/fulfillments/service.ts'
import withTransaction from '#shared/db/withTransaction.ts'

export const getSchedule = asyncHandler(async (req, res) => {
  const from = oneString(req.query.from)
  const to = oneString(req.query.to)
  const employee_id = oneString(req.query.employee_id)
  return res
    .status(200)
    .json(await fulfillmentService.getSchedule(from ?? null, to ?? null, employee_id ?? null))
})

export const cancelSchedule = asyncHandler(async (req, res) => {
  const body = parseStrict(
    FulfillmentCancelScheduleBody,
    req.body,
    'fulfillments/cancel_schedule body'
  )
  return res
    .status(200)
    .json(await withTransaction((tx) => fulfillmentService.cancelSchedule(body.fulfillment_id, tx)))
})

export const setMethod = asyncHandler(async (req, res) => {
  const body = parseStrict(FulfillmentSetMethodBody, req.body, 'fulfillments/set_method body')
  return res
    .status(200)
    .json(
      await withTransaction((tx) =>
        fulfillmentService.setMethod(body.fulfillment_id, body.method_id, tx)
      )
    )
})

export const setStatus = asyncHandler(async (req, res) => {
  const body = parseStrict(FulfillmentSetStatusBody, req.body, 'fulfillments/set_status body')
  return res
    .status(200)
    .json(
      await withTransaction((tx) => fulfillmentService.setStatus(body.fulfillment_id, body.status, tx))
    )
})

export const getFulfillmentByOrder = asyncHandler(async (req, res) => {
  const order_id = uuidParam(req, 'orderId')
  const view = await fulfillmentService.getForOrder(
    order_id,
    req.user?.id ?? null,
    req.user?.role === 'admin'
  )
  if (!view) {
    return res.status(404).json({
      error: 'Not Found',
      message: `order ${order_id} has no fulfillment`,
    })
  }
  return res.json(view)
})

export const createFulfillment = asyncHandler(async (req, res) => {
  const body = parseStrict(FulfillmentCreateBody, req.body, 'fulfillments body')
  const caller = callerId(req)
  const is_admin = req.user?.role === 'admin'
  return res
    .status(200)
    .json(
      await withTransaction((tx) => fulfillmentDrafts.createForCheckout(body, caller, is_admin, tx))
    )
})

export const getFulfillment = asyncHandler(async (req, res) => {
  const id = uuidParam(req, 'id')
  await requireFulfillmentOwner(req, id)
  const view = await fulfillmentService.getById(id)
  if (!view) {
    return res.status(404).json({
      error: 'Not Found',
      message: `no such fulfillment: ${id}`,
    })
  }
  return res.status(200).json(view)
})

export const patchFulfillment = asyncHandler(async (req, res) => {
  const id = uuidParam(req, 'id')
  await requireFulfillmentOwner(req, id)
  const body = parseStrict(FulfillmentPatchBody, req.body, 'fulfillments PATCH body')
  return res
    .status(200)
    .json(await withTransaction((tx) => fulfillmentService.patchChoices(id, body, tx)))
})
