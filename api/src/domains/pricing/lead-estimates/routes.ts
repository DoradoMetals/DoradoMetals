import express from 'express'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'
import * as controller from '#pricing/lead-estimates/controller.ts'

const router = express.Router()

router.get('/', requireAdmin, controller.getTotals)
router.get('/:leadId', requireAdmin, controller.getOne)

export default router
