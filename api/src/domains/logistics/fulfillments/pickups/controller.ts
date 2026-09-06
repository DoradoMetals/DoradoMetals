import { FulfillmentSchedulePickupBody } from '@dorado/contracts'
import { parseStrict, uuidParam } from '#shared/http/validate.ts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import * as pickupService from '#logistics/fulfillments/pickups/service.ts'

export const schedulePickup = asyncHandler(async (req, res) => {
  const body = parseStrict(
    FulfillmentSchedulePickupBody,
    req.body,
    'fulfillments/schedule_pickup body'
  )
  return res
    .status(200)
    .json(
      await withTransaction((tx) => pickupService.schedule(body.fulfillment_id, body.pickup, tx))
    )
})

export const getPickupsByOrder = asyncHandler(async (req, res) => {
  return res.json(await pickupService.forOrder(uuidParam(req, 'orderId')))
})
