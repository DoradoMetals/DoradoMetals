import express from 'express'
import { listMetals, listPurityLabels } from '#pricing/metals/controller.ts'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/purity_labels', requireAdmin, listPurityLabels)
router.get('/', requireAdmin, listMetals)

export default router
