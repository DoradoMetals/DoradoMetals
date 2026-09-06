import { z } from 'zod/v4'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { parseStrict } from '#shared/http/validate.ts'
import { clientIp } from '#shared/net/client-ip.ts'
import * as captcha from '#providers/captcha/index.ts'

const VerifyBody = z.object({ token: z.string().min(1) }).strict()

export const verifyRecaptcha = asyncHandler(async (req, res) => {
  const { token } = parseStrict(VerifyBody, req.body, 'recaptcha/verify-recaptcha body')
  const isHuman = await captcha.verify(token, clientIp(req))
  return res.json(isHuman)
})
