import { z } from 'zod/v4'
import { fromNodeHeaders } from 'better-auth/node'

import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { parseStrict } from '#shared/http/validate.ts'
import { auth } from '#accounts/auth/client.ts'
import { assertMaySetPassword } from '#accounts/auth/rules.ts'

const SetPasswordBody = z.object({ newPassword: z.string().min(1) }).strict()

export const setPassword = asyncHandler(async (req, res) => {
  const { newPassword } = parseStrict(SetPasswordBody, req.body, 'auth/set_password body')
  const headers = fromNodeHeaders(req.headers)

  const live = await auth.api.getSession({ headers, query: { disableCookieCache: true } })
  assertMaySetPassword(live?.user?.isAnonymous, live?.session?.createdAt, Date.now())

  await auth.api.setPassword({ body: { newPassword }, headers })
  await auth.api.revokeOtherSessions({ headers })

  return res.status(200).json({ success: true })
})
