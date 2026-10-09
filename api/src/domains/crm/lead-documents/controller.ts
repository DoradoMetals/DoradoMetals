import { uuidParam } from '#shared/http/validate.ts'
import { firstFile } from '#shared/http/multipart.ts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as service from '#crm/lead-documents/service.ts'

export const getAll = asyncHandler(async (req, res) => {
  const lead_id = uuidParam(req, 'id')
  return res.status(200).json(await service.forLead(lead_id))
})

export const add = asyncHandler(async (req, res) => {
  const lead_id = uuidParam(req, 'id')
  const file = firstFile(req.get('content-type') ?? '', req.body)
  return res.status(201).json(await service.add(lead_id, file?.bytes ?? null))
})

export const remove = asyncHandler(async (req, res) => {
  const lead_id = uuidParam(req, 'id')
  const pdf_id = uuidParam(req, 'pdfId')
  return res.status(200).json(await service.remove(lead_id, pdf_id))
})
