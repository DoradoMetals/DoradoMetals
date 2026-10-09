import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as service from '#crm/funnel/service.ts'

export const get = asyncHandler(async (_req, res) => {
  return res.status(200).json(await service.get())
})
