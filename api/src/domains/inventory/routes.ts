import express from 'express'

import {
  addLotImage,
  combineLots,
  getInventorySummary,
  getLot,
  getLotImages,
  listLots,
  removeLotImage,
} from '#inventory/controller.ts'

import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/', requireAdmin, listLots)
router.post('/combine', requireAdmin, combineLots)
router.get('/:id', requireAdmin, getLot)
router.get('/:id/images', requireAdmin, getLotImages)
router.post('/:id/images', requireAdmin, addLotImage)
router.delete('/:id/images/:imageId', requireAdmin, removeLotImage)

export const inventorySummaryRoutes = express.Router()
inventorySummaryRoutes.get('/summary', requireAdmin, getInventorySummary)

export default router
