import express from 'express'

import { requireAdmin } from '#shared/middleware/authMiddleware.ts'
import { isFake as emailIsFake } from '#providers/resend/index.ts'
import * as controller from '#documents/outbox/controller.ts'

const router = express.Router()

export const outboxEnabled = emailIsFake() && process.env.NODE_ENV !== 'production'
if (outboxEnabled) {
  router.get('/', requireAdmin, controller.list)
  router.get('/:message_id', requireAdmin, controller.show)
}

export default router
