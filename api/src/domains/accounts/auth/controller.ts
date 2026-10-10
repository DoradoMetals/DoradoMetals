import type { Request, Response } from 'express'
import { z } from 'zod/v4'
import { fromNodeHeaders } from 'better-auth/node'
import {
  AccountProfilePatch,
  ChangeEmailBody,
  ChangePhoneBody,
  ConfirmChangeBody,
  SendCodeBody,
  SignUpBody,
  VerifyCodeBody,
  type OtpChannel,
} from '@dorado/contracts'

import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { callerId, requiredParam } from '#shared/http/caller.ts'
import { parseStrict, strictBody } from '#shared/http/validate.ts'
import { clientIp } from '#shared/net/client-ip.ts'
import { readCookie } from '#shared/net/cookies.ts'
import { sessions } from '#accounts/auth/session.ts'
import * as service from '#accounts/auth/service.ts'
import * as rules from '#accounts/auth/rules.ts'

const LastCodeQuery = z.object({ number: z.string().optional(), email: z.string().optional() })

const sessionOf = (req: Request): string => requiredParam(req.sessionId, 'session')

const isHttps = (req: Request): boolean =>
  req.secure || req.headers['x-forwarded-proto'] === 'https'

function dropLastCodeCookie(
  req: Request,
  res: Response,
  channel: OtpChannel,
  destination: string
): void {
  res.cookie(rules.LAST_CODE_COOKIE, rules.lastCodeCookieValue(channel, destination), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps(req),
    maxAge: rules.LAST_CODE_COOKIE_MAX_AGE_MS,
  })
}

export const sendCode = asyncHandler(async (req, res) => {
  const body = strictBody(SendCodeBody, req.body)
  const view = await service.sendCode(body, clientIp(req))
  if (service.readsBackCodes()) {
    const destination = rules.destinationOf(
      body.channel,
      body.phone_number ?? null,
      body.email ?? null
    )
    dropLastCodeCookie(req, res, body.channel, destination)
  }
  return res.status(200).json(view)
})

export const signUp = asyncHandler(async (req, res) => {
  const body = strictBody(SignUpBody, req.body)
  const view = await service.signUp(body, clientIp(req))
  if (service.readsBackCodes()) {
    const channel: OtpChannel = body.phone_number ? 'sms' : 'email'
    const destination = body.phone_number ?? body.email.toLowerCase()
    dropLastCodeCookie(req, res, channel, destination)
  }
  return res.status(200).json(view)
})

export const verifyCode = asyncHandler(async (req, res) => {
  const body = strictBody(VerifyCodeBody, req.body)
  const caller = await sessions.current(fromNodeHeaders(req.headers))
  const [view, cookies] = await service.verifyCode(body, caller.session?.session?.id ?? null)
  for (const cookie of cookies) res.append('set-cookie', cookie)
  return res.status(200).json(view)
})

export const stepUp = asyncHandler(async (req, res) => {
  const view = await service.stepUp(callerId(req), sessionOf(req), clientIp(req))
  if (service.readsBackCodes()) {
    const destination = await service.stepUpDestination(callerId(req))
    dropLastCodeCookie(req, res, view.channel, destination)
  }
  return res.status(200).json(view)
})

export const changeEmail = asyncHandler(async (req, res) => {
  const body = strictBody(ChangeEmailBody, req.body)
  const view = await service.changeEmail(callerId(req), sessionOf(req), body.email, clientIp(req))
  if (service.readsBackCodes()) {
    const destination = await service.changeOtpDestination(callerId(req), 'email')
    dropLastCodeCookie(req, res, view.channel, destination)
  }
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
  if (service.readsBackCodes()) {
    const destination = await service.changeOtpDestination(callerId(req), 'phone')
    dropLastCodeCookie(req, res, view.channel, destination)
  }
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
  if (!query.number && !query.email) {
    const cookie = rules.lastCodeCookieQuery(readCookie(req.headers.cookie, rules.LAST_CODE_COOKIE))
    return res.status(200).json({ code: service.lastCode(cookie.number, cookie.email) })
  }
  return res.status(200).json({ code: service.lastCode(query.number, query.email) })
})

export const authFakes = asyncHandler(async (req, res) => {
  return res.status(200).json(service.authFakes())
})

export const getAccount = asyncHandler(async (req, res) => {
  return res.status(200).json(await service.profile(callerId(req)))
})

export const patchAccount = asyncHandler(async (req, res) => {
  const body = strictBody(AccountProfilePatch, req.body)
  return res.status(200).json(await service.updateProfile(callerId(req), body))
})

export const deleteAccount = asyncHandler(async (req, res) => {
  return res.status(200).json(await service.requestDeletion(callerId(req)))
})
