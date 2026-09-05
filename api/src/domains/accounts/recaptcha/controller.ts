import { z } from 'zod/v4'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { parseStrict } from '#shared/http/validate.ts'
import * as recaptcha from '#providers/captcha/recaptcha.ts'

const VerifyBody = z.object({ token: z.string().min(1) }).strict()

export const verifyRecaptcha = asyncHandler(async (req, res) => {
  const { token } = parseStrict(VerifyBody, req.body, 'recaptcha/verify-recaptcha body')
  const isHuman = await recaptcha.verifyToken(token)
  return res.json(isHuman)
})
