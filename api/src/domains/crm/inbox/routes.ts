import express from 'express'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'
import * as controller from '#crm/inbox/controller.ts'

const router = express.Router()
router.get('/', requireAdmin, controller.list)
router.patch('/:key/read', requireAdmin, controller.markRead)

export default router
