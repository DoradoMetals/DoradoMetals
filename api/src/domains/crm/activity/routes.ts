import express from 'express'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'
import * as controller from '#crm/activity/controller.ts'

const router = express.Router()

router.get('/', requireAdmin, controller.list)

export default router
