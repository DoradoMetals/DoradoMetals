import { FulfillmentScheduleDirectBody } from '@dorado/contracts'
import { parseStrict, uuidParam } from '#shared/http/validate.ts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import * as directService from '#logistics/fulfillments/directs/service.ts'
import * as emails from '#documents/emails/service.ts'

export const scheduleDirect = asyncHandler(async (req, res) => {
  const body = parseStrict(
    FulfillmentScheduleDirectBody,
    req.body,
    'fulfillments/schedule_direct body'
  )
  const view = await withTransaction((tx) =>
    directService.schedule(body.fulfillment_id, body.direct, tx)
  )
  // After the booking is committed, never inside it. A walk-in is not an
  // appointment and the mailer's own read refuses it, so nothing is sent for
  // one; a draft has no order yet, so there is nobody to tell.
  if (view?.fulfillment.order_id) await emails.sendAppointmentBooked(view.fulfillment.order_id)
  return res.status(200).json(view)
})

export const getDirectsByOrder = asyncHandler(async (req, res) => {
  return res.json(await directService.forOrder(uuidParam(req, 'orderId')))
})
