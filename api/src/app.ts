import '#env'
import express from 'express'
import cors from 'cors'

import productRoutes from '#catalog/products/routes.ts'
import mintRoutes from '#catalog/mints/routes.ts'
import metalRoutes from '#pricing/metals/routes.ts'
import addressRoutes from '#accounts/places/addresses/routes.ts'
import checkoutRowRoutes from '#checkout/checkout.routes.ts'
import pdfRoutes from '#documents/pdfs/routes.ts'
import reviewRoutes from '#crm/reviews/routes.ts'
import emailRoutes from '#documents/emails/routes.ts'
import paymentRoutes from '#transactions/routes.ts'
import paymentMethodRoutes from '#transactions/methods/routes.ts'
import spotRoutes from '#pricing/spots/routes.ts'
import transactionRoutes from '#transactions/ledger/routes.ts'
import ordersRoutes from '#orders/routes.ts'
import searchRoutes from '#orders/search/routes.ts'
import inventoryRoutes from '#inventory/routes.ts'
import { inventorySummaryRoutes } from '#inventory/routes.ts'
import locationRoutes from '#accounts/places/locations/routes.ts'
import employeeRoutes from '#accounts/employees/routes.ts'
import shipmentRoutes from '#logistics/shipping/shipments/routes.ts'
import paymentDetailsRoutes from '#transactions/details/routes.ts'
import payoutRoutes from '#transactions/payouts/routes.ts'
import chargeRoutes from '#transactions/charges/routes.ts'
import inboundRoutes from '#transactions/inbound/routes.ts'
import bankLinkRoutes from '#transactions/banks/routes.ts'
import paymentViewRoutes from '#transactions/rails/routes.ts'
import supplierRoutes from '#refining/refiners/routes.ts'
import refiningRoutes from '#refining/routes.ts'
import carriersRoutes from '#logistics/shipping/carriers/routes.ts'
import userRoutes from '#accounts/users/routes.ts'
import accountRoutes from '#accounts/auth/routes.ts'
import imageRoutes from '#accounts/images/routes.ts'
import leadRoutes from '#crm/leads/routes.ts'
import leadFunnelRoutes from '#crm/funnel/routes.ts'
import leadEstimateItemRoutes from '#crm/estimates/routes.ts'
import leadDocumentRoutes from '#crm/lead-documents/routes.ts'
import leadTimelineRoutes from '#crm/timeline/leads.routes.ts'
import leadEstimatePricingRoutes from '#pricing/lead-estimates/routes.ts'
import rateRoutes from '#pricing/rates/routes.ts'
import quoteRoutes from '#pricing/routes.ts'
import shippingRoutes from '#logistics/shipping/routes.ts'
import carrierServiceRoutes from '#logistics/shipping/services/routes.ts'
import fulfillmentRoutes from '#logistics/fulfillments/routes.ts'
import smsRoutes from '#crm/sms/routes.ts'
import callsRoutes from '#crm/calls/routes.ts'
import timelineRoutes from '#crm/timeline/routes.ts'
import inboxRoutes from '#crm/inbox/routes.ts'
import noteRoutes from '#crm/notes/routes.ts'
import activityRoutes from '#crm/activity/routes.ts'

import { toNodeHandler } from 'better-auth/node'
import { auth } from '#accounts/auth/client.ts'
import { handleStripeWebhook } from '#transactions/controller.ts'
import { handleMoovWebhook, handlePlaidWebhook } from '#transactions/rails/controller.ts'
import { handleResendWebhook } from '#documents/emails/controller.ts'
import * as smsController from '#crm/sms/controller.ts'
import * as callsController from '#crm/calls/controller.ts'
import errorHandler from '#shared/middleware/errorHandler.ts'
import { httpLogger } from '#shared/logging/http.ts'

const app = express()

app.use(httpLogger)

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  })
)

app.post('/api/auth/stripe/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook)

app.post('/api/webhooks/moov', express.raw({ type: 'application/json' }), handleMoovWebhook)

app.post('/api/webhooks/plaid', express.raw({ type: 'application/json' }), handlePlaidWebhook)

app.post('/api/webhooks/resend', express.raw({ type: 'application/json' }), handleResendWebhook)
app.post('/api/sms/inbound', express.urlencoded({ extended: false }), smsController.inbound)
app.post('/api/sms/status', express.urlencoded({ extended: false }), smsController.status)
app.post('/api/calls/twiml', express.urlencoded({ extended: false }), callsController.twiml)
app.post('/api/calls/status', express.urlencoded({ extended: false }), callsController.status)

app.all('/api/auth/*splat', toNodeHandler(auth))

app.use(express.json())
app.use((req, _res, next) => {
  if (req.body === undefined) req.body = {}
  next()
})

app.use('/api/stripe', paymentRoutes)
app.use('/api/payments/methods', paymentMethodRoutes)
app.use('/api/products', productRoutes)
app.use('/api/mints', mintRoutes)
app.use('/api/metals', metalRoutes)
app.use('/api/addresses', addressRoutes)
app.use('/api/checkout', checkoutRowRoutes)
app.use('/api/shipping', shippingRoutes)
app.use('/api/spots', spotRoutes)
app.use('/api/pdf', pdfRoutes)
app.use('/api/reviews', reviewRoutes)
app.use('/api/emails', emailRoutes)
app.use('/api/transactions', transactionRoutes)
app.use('/api/orders', ordersRoutes)
app.use('/api/search', searchRoutes)
app.use('/api/lots', inventoryRoutes)
app.use('/api/inventory', inventorySummaryRoutes)
app.use('/api/locations', locationRoutes)
app.use('/api/employees', employeeRoutes)
app.use('/api/shipments', shipmentRoutes)
app.use('/api/payments/details', paymentDetailsRoutes)
app.use('/api/payments/payouts', payoutRoutes)
app.use('/api/payments/charges', chargeRoutes)
app.use('/api/payments/inbound', inboundRoutes)
app.use('/api/payments/banks', bankLinkRoutes)
app.use('/api/payments/view', paymentViewRoutes)
app.use('/api/suppliers', supplierRoutes)
app.use('/api/refining', refiningRoutes)
app.use('/api/users', userRoutes)
app.use('/api/account', accountRoutes)
app.use('/api/images', imageRoutes)
app.use('/api/pricing/lead-estimates', leadEstimatePricingRoutes)
// Ahead of leadRoutes: its `/:id` would read "funnel" as a lead id.
app.use('/api/leads', leadFunnelRoutes)
app.use('/api/leads', leadEstimateItemRoutes)
app.use('/api/leads', leadDocumentRoutes)
app.use('/api/leads', leadTimelineRoutes)
app.use('/api/leads', leadRoutes)
app.use('/api/rates', rateRoutes)
app.use('/api/quotes', quoteRoutes)
app.use('/api/carriers', carriersRoutes)
app.use('/api/carrier_services', carrierServiceRoutes)
app.use('/api/fulfillments', fulfillmentRoutes)
app.use('/api/sms', smsRoutes)
app.use('/api/calls', callsRoutes)
app.use('/api/customers', timelineRoutes)
app.use('/api/inbox', inboxRoutes)
app.use('/api/notes', noteRoutes)
app.use('/api/activity', activityRoutes)

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' })
})

app.use(errorHandler)

export default app
