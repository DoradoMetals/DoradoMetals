import type { Request } from 'express'
import { SendOrderEmailBody } from '@dorado/contracts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { strictBody } from '#shared/http/validate.ts'
import * as emailService from '#media/emails/service.ts'
import * as inputs from '#media/pdfs/order-inputs.ts'
import * as orderRead from '#orders/read.ts'
import { Forbidden, Invalid, NotFound } from '#shared/errors.ts'

async function recipientFor(order_id: string, caller: Request['user']): Promise<string> {
  const order = await orderRead.view(order_id)
  if (!order) throw new NotFound(`no order ${order_id}`)

  const ownsIt = order.order.user_id === caller?.id
  if (!ownsIt && caller?.role !== 'admin') {
    throw new Forbidden(`order ${order_id} is not yours`)
  }

  const to = order.user?.email
  if (!to) throw new Invalid('the order has no customer email on record')
  return to
}

export const sendCreatedEmail = asyncHandler(async (req, res) => {
  const { order_id } = strictBody(SendOrderEmailBody, req.body)
  const to = await recipientFor(order_id, req.user)
  await emailService.sendCreatedEmail(await inputs.packingListInputs(order_id), to)
  return res.status(200).json({ success: true })
})

export const sendPricedEmail = asyncHandler(async (req, res) => {
  const { order_id } = strictBody(SendOrderEmailBody, req.body)
  const to = await recipientFor(order_id, req.user)
  await emailService.sendPricedEmail(await inputs.invoiceInputs(order_id), to)
  return res.status(200).json({ success: true })
})
