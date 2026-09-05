import { UpdateCreditBody } from '@dorado/contracts'
import { param } from '#shared/http/caller.ts'
import { parseStrict } from '#shared/http/validate.ts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as creditService from '#payments/credit/service.ts'

export const updateCredit = asyncHandler(async (req, res) => {
  const body = parseStrict(UpdateCreditBody, req.body, 'users/credit body')
  return res.status(200).json(await creditService.adjustDoradoCredit(param(req, 'id'), body))
})
