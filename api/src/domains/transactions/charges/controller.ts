import { FailTransferBody, OpenChargeBody, RequestChargeBody } from '@dorado/contracts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { parseStrict, uuidParam } from '#shared/http/validate.ts'
import * as charges from '#transactions/charges/service.ts'

export const openCharge = asyncHandler(async (req, res) => {
  const body = parseStrict(OpenChargeBody, req.body, 'payments/charges body')
  return res.status(201).json(await charges.openCharge(body))
})

export const getCharge = asyncHandler(async (req, res) => {
  return res.json(await charges.getCharge(uuidParam(req, 'id')))
})

export const requestCharge = asyncHandler(async (req, res) => {
  const body = parseStrict(RequestChargeBody, req.body, 'payments/charges request body')
  return res.json(await charges.requestCharge(uuidParam(req, 'id'), body.bank_link_id))
})

export const failCharge = asyncHandler(async (req, res) => {
  const body = parseStrict(FailTransferBody, req.body, 'payments/charges fail body')
  return res.json(await charges.failCharge(uuidParam(req, 'id'), body.reason))
})
