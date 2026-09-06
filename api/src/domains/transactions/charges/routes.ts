import express from 'express'
import {
  failCharge,
  getCharge,
  openCharge,
  requestCharge,
} from '#transactions/charges/controller.ts'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.post('/', requireAdmin, openCharge)
router.get('/:id', requireAdmin, getCharge)
router.post('/:id/request', requireAdmin, requestCharge)
router.post('/:id/fail', requireAdmin, failCharge)

export default router
