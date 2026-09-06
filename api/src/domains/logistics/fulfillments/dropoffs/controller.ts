import { FulfillmentScheduleDropoffBody } from '@dorado/contracts'
import { parseStrict, uuidParam } from '#shared/http/validate.ts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import * as dropoffService from '#logistics/fulfillments/dropoffs/service.ts'

export const scheduleDropoff = asyncHandler(async (req, res) => {
  const body = parseStrict(
    FulfillmentScheduleDropoffBody,
    req.body,
    'fulfillments/schedule_dropoff body'
  )
  return res
    .status(200)
    .json(
      await withTransaction((tx) => dropoffService.schedule(body.fulfillment_id, body.dropoff, tx))
    )
})

export const getDropoffsByOrder = asyncHandler(async (req, res) => {
  return res.json(await dropoffService.forOrder(uuidParam(req, 'orderId')))
})
