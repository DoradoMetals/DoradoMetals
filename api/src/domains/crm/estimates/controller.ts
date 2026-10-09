import { EstimateItemPatch } from '@dorado/contracts'
import { strictBody, uuidParam } from '#shared/http/validate.ts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as service from '#crm/estimates/service.ts'

export const getAll = asyncHandler(async (req, res) => {
  const lead_id = uuidParam(req, 'id')
  return res.status(200).json(await service.forLead(lead_id))
})

export const create = asyncHandler(async (req, res) => {
  const lead_id = uuidParam(req, 'id')
  const body = strictBody(EstimateItemPatch, req.body)
  return res.status(201).json(await service.create(lead_id, body))
})

export const update = asyncHandler(async (req, res) => {
  const lead_id = uuidParam(req, 'id')
  const id = uuidParam(req, 'itemId')
  const body = strictBody(EstimateItemPatch, req.body)
  return res.status(200).json(await service.update(lead_id, id, body))
})

export const remove = asyncHandler(async (req, res) => {
  const lead_id = uuidParam(req, 'id')
  const id = uuidParam(req, 'itemId')
  const removed = await service.remove(lead_id, id)
  if (!removed) return res.status(404).json({ message: 'no such estimate item' })
  return res.status(200).json({ message: 'Estimate item deleted' })
})
