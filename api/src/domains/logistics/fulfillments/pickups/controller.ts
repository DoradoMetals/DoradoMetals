import { FulfillmentSchedulePickupBody } from '@dorado/contracts'
import { parseStrict, uuidParam } from '#shared/http/validate.ts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import * as pickupService from '#logistics/fulfillments/pickups/service.ts'
import * as emails from '#documents/emails/service.ts'

export const schedulePickup = asyncHandler(async (req, res) => {
  const body = parseStrict(
    FulfillmentSchedulePickupBody,
    req.body,
    'fulfillments/schedule_pickup body'
  )
  const view = await withTransaction((tx) =>
    pickupService.schedule(body.fulfillment_id, body.pickup, tx)
  )
  // After the booking is committed, never inside it: an email cannot be rolled
  // back. A draft fulfillment has no order yet, so there is nobody to tell.
  if (view?.fulfillment.order_id) await emails.sendPickupBooked(view.fulfillment.order_id)
  return res.status(200).json(view)
})

export const getPickupsByOrder = asyncHandler(async (req, res) => {
  return res.json(await pickupService.forOrder(uuidParam(req, 'orderId')))
})
