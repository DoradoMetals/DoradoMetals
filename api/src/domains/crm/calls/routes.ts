import express from 'express'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'
import * as controller from '#crm/calls/controller.ts'

const router = express.Router()
router.post('/token', requireAdmin, controller.token)
router.post('/presence', requireAdmin, controller.presence)
router.get('/:id', requireAdmin, controller.getOne)

export default router
