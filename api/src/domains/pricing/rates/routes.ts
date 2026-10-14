import express from 'express'

import {
  getRate,
  listAdminRates,
  listChanges,
  listPay,
  listTiers,
  replaceBands,
} from '#pricing/rates/controller.ts'
import { generateRateSheet } from '#documents/pdfs/controller.ts'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/tiers', listTiers)
router.get('/admin', requireAdmin, listAdminRates)
router.get('/changes', requireAdmin, listChanges)
router.get('/sheet.pdf', requireAdmin, generateRateSheet)
router.get('/', listPay)
router.get('/:id', requireAdmin, getRate)
router.patch('/:metal_id', requireAdmin, replaceBands)

export default router
