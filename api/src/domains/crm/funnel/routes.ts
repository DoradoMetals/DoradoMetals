import express from 'express'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'
import * as controller from '#crm/funnel/controller.ts'

const router = express.Router()

router.get('/funnel', requireAdmin, controller.get)
router.get('/summary', requireAdmin, controller.summary)

export default router
