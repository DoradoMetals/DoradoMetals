import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { uuidParam } from '#shared/http/validate.ts'
import * as service from '#crm/timeline/service.ts'

export const getTimeline = asyncHandler(async (req, res) => {
  const id = uuidParam(req, 'id')
  const rows = await service.forCustomer(id)
  return res.status(200).json(rows)
})
