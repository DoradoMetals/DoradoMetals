import express from 'express'

import {
  combineLots,
  getInventorySummary,
  getLot,
  listLots,
} from '#inventory/controller.ts'

import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/', requireAdmin, listLots)
router.post('/combine', requireAdmin, combineLots)
router.get('/:id', requireAdmin, getLot)

export const inventorySummaryRoutes = express.Router()
inventorySummaryRoutes.get('/summary', requireAdmin, getInventorySummary)

export default router
