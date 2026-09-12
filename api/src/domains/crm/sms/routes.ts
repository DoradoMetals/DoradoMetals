import express from 'express'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'
import * as controller from '#crm/sms/controller.ts'

const router = express.Router()
router.get('/', requireAdmin, controller.getConversation)
router.post('/', requireAdmin, controller.send)
router.get('/:id', requireAdmin, controller.getOne)

export default router
