import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { strictBody, uuidParam } from '#shared/http/validate.ts'
import * as refunds from '#transactions/refunds/service.ts'
import { RefundBody } from '@dorado/contracts'

export const listOrderRefunds = asyncHandler(async (req, res) => {
  return res.json(await refunds.listForOrder(uuidParam(req, 'id')))
})

export const refundOrder = asyncHandler(async (req, res) => {
  const body = strictBody(RefundBody, req.body)
  return res
    .status(201)
    .json(await refunds.refund(uuidParam(req, 'id'), body, req.sessionId ?? null))
})

export const issueOrderRefund = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(
      await refunds.resume(uuidParam(req, 'id'), uuidParam(req, 'refund_id'), req.sessionId ?? null)
    )
})
