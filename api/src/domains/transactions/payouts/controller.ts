import { FailTransferBody, MarkSentBody, OpenPayoutBody, SendPayoutBody } from '@dorado/contracts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { parseStrict, uuidParam } from '#shared/http/validate.ts'
import { oneString } from '#shared/http/query.ts'
import { refuseWith } from '#shared/http/refuse.ts'
import * as payouts from '#transactions/payouts/service.ts'

export const openPayout = asyncHandler(async (req, res) => {
  const body = parseStrict(OpenPayoutBody, req.body, 'payments/payouts body')
  return res.status(201).json(await payouts.openPayout(body, req.sessionId ?? null))
})

export const getPayout = asyncHandler(async (req, res) => {
  return res.json(await payouts.getPayout(uuidParam(req, 'id')))
})

export const sendPayout = asyncHandler(async (req, res) => {
  const body = parseStrict(SendPayoutBody, req.body ?? {}, 'payments/payouts send body')
  return res.json(await payouts.sendPayout(uuidParam(req, 'id'), body, req.sessionId ?? null))
})

export const markPayoutSent = asyncHandler(async (req, res) => {
  const body = parseStrict(MarkSentBody, req.body, 'payments/payouts mark_sent body')
  return res.json(await payouts.markSent(uuidParam(req, 'id'), body.reference))
})

export const failPayout = asyncHandler(async (req, res) => {
  const body = parseStrict(FailTransferBody, req.body, 'payments/payouts fail body')
  return res.json(await payouts.failPayout(uuidParam(req, 'id'), body.reason))
})

export const listPayTo = asyncHandler(async (req, res) => {
  const user_id = oneString(req.query.user_id)
  if (!user_id) return refuseWith(400, '"user_id" is required')
  return res.json(await payouts.payTo(user_id))
})
