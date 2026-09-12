import express from 'express'

import {
  buyShipmentLabel,
  chargeShipment,
  getShipment,
  patchShipment,
  recordShipmentActualCost,
  recordShipmentTracking,
} from '#logistics/shipping/shipments/controller.ts'
import { requireAdmin, requireUser } from '#shared/middleware/authMiddleware.ts'
import { requireOwnShipment } from '#shared/middleware/ownership.ts'

const router = express.Router()

router.get('/:id', requireUser, requireOwnShipment, getShipment)

router.patch('/:id', requireAdmin, patchShipment)

router.post('/:id/label', requireAdmin, buyShipmentLabel)
router.post('/:id/charge', requireAdmin, chargeShipment)
router.post('/:id/actual_cost', requireAdmin, recordShipmentActualCost)
router.post('/:id/tracking', requireAdmin, recordShipmentTracking)

export default router
