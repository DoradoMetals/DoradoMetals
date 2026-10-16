import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { strictBody, uuidParam } from '#shared/http/validate.ts'
import * as disputes from '#orders/disputes/service.ts'
import { PurityDisputeOpenBody, PurityDisputeResolveBody } from '@dorado/contracts'

export const getOrderDisputes = asyncHandler(async (req, res) => {
  return res.json(await disputes.forOrder(uuidParam(req, 'id')))
})

export const openLotDispute = asyncHandler(async (req, res) => {
  const body = strictBody(PurityDisputeOpenBody, req.body)
  return res.status(201).json(await disputes.open(uuidParam(req, 'id'), body))
})

export const resolveDispute = asyncHandler(async (req, res) => {
  const body = strictBody(PurityDisputeResolveBody, req.body)
  return res.json(await disputes.resolve(uuidParam(req, 'id'), body))
})
