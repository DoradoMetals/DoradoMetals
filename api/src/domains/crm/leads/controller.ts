import {
  LeadAssignBody,
  LeadConvertBody,
  LeadListQuery,
  LeadPatch,
  LeadRestoreBody,
} from '@dorado/contracts'
import type { LeadFilter } from '@dorado/contracts'
import type { Request } from 'express'
import { requiredParam } from '#shared/http/caller.ts'
import { parseStrict, strictBody, uuidParam } from '#shared/http/validate.ts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as service from '#crm/leads/service.ts'

export const getOne = asyncHandler(async (req, res) => {
  const id = requiredParam(req.params.id, 'id')
  const lead = await service.getOne(id)
  return res.status(200).json(lead)
})

function filterOf(req: Request): LeadFilter {
  const q = parseStrict(LeadListQuery, req.query, 'leads list query')
  return {
    stage: q.stage ?? null,
    priority: q.priority ?? null,
    assigned_to: q.assigned_to ?? null,
    source_id: q.source_id ?? null,
    search: q.q ?? null,
    archived: q.archived ?? false,
    created_from: q.created_from ?? null,
    created_to: q.created_to ?? null,
    sort: q.sort ?? 'created',
    direction: q.direction ?? (q.sort === 'name' ? 'asc' : 'desc'),
    page: q.page ?? null,
    page_size: q.page_size ?? null,
  }
}

export const getAll = asyncHandler(async (req, res) => {
  return res.status(200).json(await service.list(filterOf(req)))
})

export const exportCsv = asyncHandler(async (req, res) => {
  const csv = await service.exportCsv(filterOf(req))
  res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"')
  return res.status(200).type('text/csv').send(csv)
})

export const assign = asyncHandler(async (req, res) => {
  return res.status(200).json(await service.assign(strictBody(LeadAssignBody, req.body)))
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
  await service.remove(uuidParam(req, 'id'))
  return res.status(200).json({ message: 'Lead archived' })
})

export const restore = asyncHandler(async (req, res) => {
  const id = uuidParam(req, 'id')
  strictBody(LeadRestoreBody, req.body)
  return res.status(200).json(await service.restore(id))
})

export const convert = asyncHandler(async (req, res) => {
  const id = requiredParam(req.params.id, 'id')
  const body = strictBody(LeadConvertBody, req.body)
  const customer = await service.convert(id, body)
  return res.status(201).json(customer)
})
