import type { Request } from 'express'
import { SendOrderEmailBody } from '@dorado/contracts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { strictBody } from '#shared/http/validate.ts'
import * as emailService from '#documents/emails/service.ts'
import * as email from '#providers/resend/index.ts'
import { oneString } from '#shared/http/query.ts'
import { refuseWith } from '#shared/http/refuse.ts'
import * as inputs from '#documents/pdfs/order-inputs.ts'
import * as orderRead from '#orders/read.ts'
import { Forbidden, NotFound } from '#shared/errors.ts'

async function assertTheirs(order_id: string, caller: Request['user']): Promise<void> {
  const order = await orderRead.view(order_id)
  if (!order) throw new NotFound(`no order ${order_id}`)
  const ownsIt = order.order.user_id === caller?.id
  if (!ownsIt && caller?.role !== 'admin') {
    throw new Forbidden(`order ${order_id} is not yours`)
  }
}

export const sendPricedEmail = asyncHandler(async (req, res) => {
  const { order_id } = strictBody(SendOrderEmailBody, req.body)
  await assertTheirs(order_id, req.user)
  await emailService.sendPricedEmail(await inputs.invoiceInputs(order_id))
  return res.status(200).json({ success: true })
})

export const handleResendWebhook = asyncHandler(async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : ''
  const id = oneString(req.headers[email.ID_HEADER])
  const timestamp = oneString(req.headers[email.TIMESTAMP_HEADER])
  const signature = oneString(req.headers[email.SIGNATURE_HEADER])

  if (!email.verifyWebhook(raw, id, timestamp, signature)) {
    return refuseWith(401, 'resend webhook signature did not verify')
  }

  const event = email.eventFrom(id as string, raw)
  if (event) await emailService.recordDelivery(event)
  return res.json({ received: true })
})
