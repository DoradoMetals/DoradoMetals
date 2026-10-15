import express from 'express'
import { selectionSummary } from '#pricing/controller.ts'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/selection', requireAdmin, selectionSummary)

export default router
