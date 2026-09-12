import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { uuidParam } from '#shared/http/validate.ts'
import { refuseWith } from '#shared/http/refuse.ts'
import { oneString } from '#shared/http/query.ts'
import * as moov from '#providers/moov/index.ts'
import * as plaid from '#providers/plaid/index.ts'
import * as rails from '#transactions/rails/service.ts'
import * as matching from '#transactions/inbound/service.ts'

export const getPaymentView = asyncHandler(async (req, res) => {
  return res.json(await rails.paymentView(uuidParam(req, 'orderId')))
})

export const getRefiningPayment = asyncHandler(async (req, res) => {
  return res.json(await rails.refiningPaymentView(uuidParam(req, 'id')))
})

export const handleMoovWebhook = asyncHandler(async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : ''
  const signed = moov.verify(
    raw,
    oneString(req.headers[moov.SIGNATURE_HEADER]),
    oneString(req.headers[moov.TIMESTAMP_HEADER]),
    oneString(req.headers[moov.NONCE_HEADER]),
    oneString(req.headers[moov.WEBHOOK_ID_HEADER])
  )
  if (!signed) return refuseWith(401, 'moov webhook signature did not verify')

  const event = moov.eventFrom(raw)
  if (!event) return res.json({ received: true })

  await rails.applyMoovEvent(event)
  if (event.type.startsWith('transfer.') && event.status === 'completed') {
    await matching.ingestMoovInbound(event)
  }
  return res.json({ received: true })
})

export const handlePlaidWebhook = asyncHandler(async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : ''
  const signed = await plaid.verify(oneString(req.headers[plaid.VERIFICATION_HEADER]), raw)
  if (!signed) return refuseWith(401, 'plaid webhook signature did not verify')

  await matching.syncFeed()
  return res.json({ received: true })
})
