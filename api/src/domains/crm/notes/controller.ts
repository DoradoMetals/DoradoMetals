import { NoteCreateBody, NotePatch } from '@dorado/contracts'
import { strictBody, uuidParam } from '#shared/http/validate.ts'
import { oneString } from '#shared/http/query.ts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as service from '#crm/notes/service.ts'

export const getAll = asyncHandler(async (req, res) => {
  const subject = {
    user_id: oneString(req.query.user_id) ?? null,
    lead_id: oneString(req.query.lead_id) ?? null,
  }
  return res.status(200).json(await service.forSubject(subject))
})

export const create = asyncHandler(async (req, res) => {
  const body = strictBody(NoteCreateBody, req.body)
  return res.status(201).json(await service.create(body))
})

export const update = asyncHandler(async (req, res) => {
  const id = uuidParam(req, 'id')
  const body = strictBody(NotePatch, req.body)
  return res.status(200).json(await service.update(id, body))
})

export const remove = asyncHandler(async (req, res) => {
  const id = uuidParam(req, 'id')
  const removed = await service.remove(id)
  if (!removed) return res.status(404).json({ message: 'no such note' })
  return res.status(200).json({ message: 'Note deleted' })
})
