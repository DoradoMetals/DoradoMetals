import type { Request } from 'express'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { refuseWith } from '#shared/http/refuse.ts'
import { requiredParam } from '#shared/http/caller.ts'
import { uuidLike } from '#shared/http/validate.ts'
import { oneString } from '#shared/http/query.ts'
import type { WebhookForm } from '#shared/http/webhook-form.ts'
import * as sms from '#providers/sms/index.ts'
import * as service from '#crm/sms/service.ts'
import { SmsSendBody } from '@dorado/contracts'
import { strictBody } from '#shared/http/validate.ts'

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response/>'

function verified(req: Request, path: string): WebhookForm {
  const form = (req.body ?? {}) as Record<string, string>
  const url = `${process.env.PUBLIC_API_URL ?? ''}${path}`
  const header = req.get('X-Twilio-Signature') ?? ''
  if (!sms.verifySignature(url, form, header)) refuseWith(403, 'invalid signature')
  return form
}

export const inbound = asyncHandler(async (req, res) => {
  const form = verified(req, '/api/sms/inbound')
  const parsed = sms.parseInbound(form)
  await service.receiveInbound(parsed)
  res.type('text/xml').status(200).send(EMPTY_TWIML)
})

export const status = asyncHandler(async (req, res) => {
  const form = verified(req, '/api/sms/status')
  const parsed = sms.parseStatus(form)
  await service.recordStatus(parsed)
  res.type('text/xml').status(200).send(EMPTY_TWIML)
})

export const getConversation = asyncHandler(async (req, res) => {
  const user_id = oneString(req.query.user_id)
  const number = oneString(req.query.number)
  const rows = await service.conversation(
    user_id && uuidLike.safeParse(user_id).success ? user_id : null,
    number ?? null
  )
  return res.status(200).json(rows)
})

export const send = asyncHandler(async (req, res) => {
  return res.status(201).json(await service.sendToCustomer(strictBody(SmsSendBody, req.body)))
})

export const getOne = asyncHandler(async (req, res) => {
  const id = requiredParam(req.params.id, 'id')
  const row = await service.getOne(id)
  return res.status(200).json(row)
})
