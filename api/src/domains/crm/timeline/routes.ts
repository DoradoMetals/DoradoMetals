import express from 'express'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'
import * as controller from '#crm/timeline/controller.ts'

const router = express.Router()
router.get('/:id/timeline', requireAdmin, controller.getTimeline)

export default router
