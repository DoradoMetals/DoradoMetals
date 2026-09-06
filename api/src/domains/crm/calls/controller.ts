import type { Request } from 'express'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { refuseWith } from '#shared/http/refuse.ts'
import { requiredParam, callerId } from '#shared/http/caller.ts'
import * as voice from '#providers/voice/twilio.ts'
import * as service from '#crm/calls/service.ts'
import type { WebhookForm } from '#shared/http/webhook-form.ts'

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response/>'

function verified(req: Request, path: string): WebhookForm {
  const form = (req.body ?? {}) as Record<string, string>
  const url = `${process.env.PUBLIC_API_URL ?? ''}${path}`
  const header = req.get('X-Twilio-Signature') ?? ''
  if (!voice.verifySignature(url, form, header)) refuseWith(403, 'invalid signature')
  return form
}

export const token = asyncHandler(async (req, res) => {
  const result = await service.issueToken(callerId(req))
  return res.status(200).json(result)
})

export const presence = asyncHandler(async (req, res) => {
  const online = (req.body as { online?: unknown })?.online
  if (typeof online !== 'boolean') refuseWith(400, '"online" must be a boolean')
  await service.setPresence(callerId(req), online)
  return res.status(200).json({ ok: true })
})

export const twiml = asyncHandler(async (req, res) => {
  const form = verified(req, '/api/calls/twiml')
  const xml = await service.handleTwiml(form)
  res.type('text/xml').status(200).send(xml)
})

export const status = asyncHandler(async (req, res) => {
  const form = verified(req, '/api/calls/status')
  await service.recordStatus(form)
  res.type('text/xml').status(200).send(EMPTY_TWIML)
})

export const getOne = asyncHandler(async (req, res) => {
  const id = requiredParam(req.params.id, 'id')
  const row = await service.getOne(id)
  return res.status(200).json(row)
})
