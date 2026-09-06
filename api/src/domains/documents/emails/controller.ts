import type { Request } from 'express'
import { SendOrderEmailBody } from '@dorado/contracts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { strictBody } from '#shared/http/validate.ts'
import * as emailService from '#documents/emails/service.ts'
import * as inputs from '#documents/pdfs/order-inputs.ts'
import * as orderRead from '#orders/read.ts'
import { Forbidden, NotFound } from '#shared/errors.ts'

// The caller may ask for this order's mail only if the order is theirs. WHERE
// the mail goes is the mailer's own SQL read, never the caller's to name.
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
