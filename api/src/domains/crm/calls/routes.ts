import express from 'express'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'
import * as controller from '#crm/calls/controller.ts'

// The two Twilio webhooks (POST /api/calls/twiml, POST /api/calls/status) are
// form-encoded and mount directly in app.ts, before express.json(), the same
// way the Stripe webhook and the sms webhooks do - they are not routed
// through this router.

const router = express.Router()
router.post('/token', requireAdmin, controller.token)
router.post('/presence', requireAdmin, controller.presence)
router.get('/:id', requireAdmin, controller.getOne)

export default router
