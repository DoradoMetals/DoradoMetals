import { strictBody, uuidParam } from '#shared/http/validate.ts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as service from '#logistics/shipping/claims/service.ts'
import { ShipmentClaimOpenBody, ShipmentClaimPatchBody } from '@dorado/contracts'

export const openClaim = asyncHandler(async (req, res) => {
  const body = strictBody(ShipmentClaimOpenBody, req.body)
  return res.status(201).json(await service.open(uuidParam(req, 'id'), body))
})

export const patchClaim = asyncHandler(async (req, res) => {
  const body = strictBody(ShipmentClaimPatchBody, req.body)
  return res
    .status(200)
    .json(await service.patch(uuidParam(req, 'id'), uuidParam(req, 'claim_id'), body))
})

export const getShipmentClaims = asyncHandler(async (req, res) => {
  return res.json(await service.forShipment(uuidParam(req, 'id')))
})

export const getOrderClaims = asyncHandler(async (req, res) => {
  return res.json(await service.forOrder(uuidParam(req, 'id')))
})
