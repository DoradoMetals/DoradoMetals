import type { Request } from 'express'
import { fromNodeHeaders } from 'better-auth/node'

import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { requiredParam } from '#shared/http/caller.ts'
import { readCookie } from '#shared/net/cookies.ts'
import { sessions } from '#accounts/auth/session.ts'
import { LAST_CODE_COOKIE, lastCodeCookieQuery } from '#accounts/auth/rules.ts'
import * as service from '#accounts/messages/service.ts'

const callerOf = async (req: Request): Promise<string | null> => {
  const caller = await sessions.current(fromNodeHeaders(req.headers))
  return caller.session?.user?.id ?? null
}

const pendingOf = (req: Request) =>
  lastCodeCookieQuery(readCookie(req.headers.cookie, LAST_CODE_COOKIE))

export const listMessages = asyncHandler(async (req, res) => {
  const pending = pendingOf(req)
  const messages = await service.list(
    await callerOf(req),
    pending.email ?? null,
    pending.number ?? null
  )
  return res.status(200).json(messages)
})

export const showMessage = asyncHandler(async (req, res) => {
  const message_id = requiredParam(req.params.message_id, 'message_id')
  const pending = pendingOf(req)
  const html = await service.show(
    await callerOf(req),
    pending.email ?? null,
    pending.number ?? null,
    message_id
  )
  return res.status(200).type('html').send(html)
})
