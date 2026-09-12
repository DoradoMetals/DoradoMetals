import { uuidParam } from '#shared/http/validate.ts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as dropoffService from '#logistics/fulfillments/dropoffs/service.ts'

export const getDropoffsByOrder = asyncHandler(async (req, res) => {
  return res.json(await dropoffService.forOrder(uuidParam(req, 'orderId')))
})
