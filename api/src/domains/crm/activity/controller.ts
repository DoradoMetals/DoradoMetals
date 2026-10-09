import { ActivityFilter } from '@dorado/contracts'
import { parseStrict } from '#shared/http/validate.ts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as service from '#crm/activity/service.ts'

export const list = asyncHandler(async (req, res) => {
  const filter = parseStrict(ActivityFilter, req.query, 'activity query')
  return res.status(200).json(await service.list(filter))
})
