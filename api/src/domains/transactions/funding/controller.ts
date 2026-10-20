import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as funding from '#transactions/funding/service.ts'

export const listFundingSources = asyncHandler(async (_req, res) => {
  return res.json(await funding.list())
})
