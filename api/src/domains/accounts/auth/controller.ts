import type { Request } from 'express'
import { z } from 'zod/v4'
import { fromNodeHeaders } from 'better-auth/node'
import {
  ChangeEmailBody,
  ChangePhoneBody,
  ConfirmChangeBody,
  SendCodeBody,
  SignUpBody,
  VerifyCodeBody,
} from '@dorado/contracts'

import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { callerId, requiredParam } from '#shared/http/caller.ts'
import { parseStrict, strictBody } from '#shared/http/validate.ts'
import { clientIp } from '#shared/net/client-ip.ts'
import { sessions } from '#accounts/auth/session.ts'
import * as service from '#accounts/auth/service.ts'

const LastCodeQuery = z.object({ number: z.string() })

const sessionOf = (req: Request): string => requiredParam(req.sessionId, 'session')

export const sendCode = asyncHandler(async (req, res) => {
  const body = strictBody(SendCodeBody, req.body)
  return res.status(200).json(await service.sendCode(body, clientIp(req)))
})

export const signUp = asyncHandler(async (req, res) => {
  const body = strictBody(SignUpBody, req.body)
  return res.status(200).json(await service.signUp(body, clientIp(req)))
})

// Unguarded, because a sign-in has no session yet - but a step-up does, and the
// session it stamps is the caller's own.
export const verifyCode = asyncHandler(async (req, res) => {
  const body = strictBody(VerifyCodeBody, req.body)
  const caller = await sessions.current(fromNodeHeaders(req.headers))
  const [view, cookies] = await service.verifyCode(body, caller.session?.session?.id ?? null)
  for (const cookie of cookies) res.append('set-cookie', cookie)
  return res.status(200).json(view)
})

export const stepUp = asyncHandler(async (req, res) => {
  const view = await service.stepUp(callerId(req), sessionOf(req), clientIp(req))
  return res.status(200).json(view)
})

export const changeEmail = asyncHandler(async (req, res) => {
  const body = strictBody(ChangeEmailBody, req.body)
  const view = await service.changeEmail(callerId(req), sessionOf(req), body.email, clientIp(req))
  return res.status(200).json(view)
})

export const changePhone = asyncHandler(async (req, res) => {
  const body = strictBody(ChangePhoneBody, req.body)
  const view = await service.changePhone(
    callerId(req),
    sessionOf(req),
    body.phone_number,
    clientIp(req)
  )
  return res.status(200).json(view)
})

export const confirmChange = asyncHandler(async (req, res) => {
  const body = strictBody(ConfirmChangeBody, req.body)
  return res.status(200).json(await service.confirmChange(callerId(req), sessionOf(req), body))
})

export const session = asyncHandler(async (req, res) => {
  return res.status(200).json(await service.sessionOf(callerId(req), sessionOf(req)))
})

export const lastCode = asyncHandler(async (req, res) => {
  const query = parseStrict(LastCodeQuery, req.query, 'account/last_code query')
  return res.status(200).json({ code: service.lastCode(query.number) })
})
