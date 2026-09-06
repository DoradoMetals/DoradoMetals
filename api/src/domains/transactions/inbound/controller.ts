import { ConfirmMatchBody, RecordWireBody } from '@dorado/contracts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { parseStrict, uuidParam } from '#shared/http/validate.ts'
import { callerId } from '#shared/http/caller.ts'
import { oneString } from '#shared/http/query.ts'
import { refuseWith } from '#shared/http/refuse.ts'
import * as matching from '#transactions/inbound/service.ts'

export const listUnmatched = asyncHandler(async (_req, res) => {
  return res.json(await matching.listUnmatched())
})

export const listCandidates = asyncHandler(async (req, res) => {
  const order_id = oneString(req.query.order_id)
  if (!order_id) return refuseWith(400, '"order_id" is required')
  return res.json(await matching.candidatesFor(order_id))
})

export const recordWire = asyncHandler(async (req, res) => {
  const body = parseStrict(RecordWireBody, req.body, 'payments/inbound wire body')
  return res.status(201).json(await matching.recordWire(body))
})

export const confirmMatch = asyncHandler(async (req, res) => {
  const body = parseStrict(ConfirmMatchBody, req.body, 'payments/inbound match body')
  return res.json(await matching.confirmMatch(uuidParam(req, 'id'), body.order_id, callerId(req)))
})

export const unmatch = asyncHandler(async (req, res) => {
  return res.json(await matching.unmatch(uuidParam(req, 'id')))
})

export const syncFeed = asyncHandler(async (_req, res) => {
  return res.json(await matching.syncFeed())
})
