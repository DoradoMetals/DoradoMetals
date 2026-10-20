import express from 'express'
import { orderPreview, selectionSummary } from '#pricing/controller.ts'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/selection', requireAdmin, selectionSummary)
router.post('/preview', requireAdmin, orderPreview)

export default router
