import express from 'express'
import {
  getCharge,
  openCharge,
  patchCharge,
  requestCharge,
} from '#transactions/charges/controller.ts'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.post('/', requireAdmin, openCharge)
router.get('/:id', requireAdmin, getCharge)
router.post('/:id/request', requireAdmin, requestCharge)
router.patch('/:id', requireAdmin, patchCharge)

export default router
