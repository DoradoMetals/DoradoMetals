import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { uuidParam } from '#shared/http/validate.ts'
import { parseSettlement } from '#refining/settlement-parse/service.ts'

export const parseRefiningSettlement = asyncHandler(async (req, res) => {
  return res.json(await parseSettlement(uuidParam(req, 'id')))
})
