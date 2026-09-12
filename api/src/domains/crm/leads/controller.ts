import { LeadConvertBody, LeadPatch, LeadStage } from '@dorado/contracts'
import { requiredParam } from '#shared/http/caller.ts'
import { oneString } from '#shared/http/query.ts'
import { parseStrict, strictBody } from '#shared/http/validate.ts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as service from '#crm/leads/service.ts'

export const getOne = asyncHandler(async (req, res) => {
  const id = requiredParam(req.params.id, 'id')
  const lead = await service.getOne(id)
  return res.status(200).json(lead)
})

export const getAll = asyncHandler(async (req, res) => {
  const rawStage = oneString(req.query.stage)
  const stage = rawStage ? parseStrict(LeadStage, rawStage, 'leads stage filter') : null

  const filter = {
    stage,
    priority: oneString(req.query.priority) ?? null,
    assigned_to: oneString(req.query.assigned_to) ?? null,
    source: oneString(req.query.source) ?? null,
    search: oneString(req.query.q) ?? null,
  }
  return res.status(200).json(await service.list(filter))
})

export const create = asyncHandler(async (req, res) => {
  const body = parseStrict(LeadPatch.strict(), req.body, 'leads/create body')
  const lead = await service.create(body)
  return res.status(201).json(lead)
})

export const update = asyncHandler(async (req, res) => {
  const id = requiredParam(req.params.id, 'id')
  const body = parseStrict(LeadPatch.strict(), req.body, 'leads/update body')
  const lead = await service.update(id, body)
  return res.status(200).json(lead)
})

export const remove = asyncHandler(async (req, res) => {
  const id = requiredParam(req.params.id, 'id')
  const removed = await service.remove(id)
  if (!removed) return res.status(404).json({ message: 'no such lead' })
  return res.status(200).json({ message: 'Lead deleted' })
})

export const convert = asyncHandler(async (req, res) => {
  const id = requiredParam(req.params.id, 'id')
  const body = strictBody(LeadConvertBody, req.body)
  const customer = await service.convert(id, body)
  return res.status(201).json(customer)
})
