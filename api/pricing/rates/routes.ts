import express from 'express'

import {
  createRate,
  deleteRate,
  getRate,
  listAdminRates,
  listRates,
  listTiers,
  updateRate,
} from '#pricing/rates/controller.ts'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/tiers', listTiers)
router.get('/admin', requireAdmin, listAdminRates)
router.get('/', listRates)
router.get('/:id', requireAdmin, getRate)

router.post('/', requireAdmin, createRate)
router.patch('/:id', requireAdmin, updateRate)
router.delete('/:id', requireAdmin, deleteRate)

export default router
