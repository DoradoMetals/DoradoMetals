import express from 'express'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'
import * as controller from '#crm/sms/controller.ts'

// The two Twilio webhooks (POST /api/sms/inbound, POST /api/sms/status) are
// form-encoded and mount directly in app.ts, before express.json(), each with
// its own express.urlencoded() - the same way the Stripe webhook mounts, so
// they are not routed through this router.

const router = express.Router()
router.get('/', requireAdmin, controller.getConversation)
router.get('/:id', requireAdmin, controller.getOne)

export default router
