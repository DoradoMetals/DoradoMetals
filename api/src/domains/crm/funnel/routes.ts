import express from 'express'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'
import * as controller from '#crm/funnel/controller.ts'

const router = express.Router()

router.get('/funnel', requireAdmin, controller.get)

export default router
