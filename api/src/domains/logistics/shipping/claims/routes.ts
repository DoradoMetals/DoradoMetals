import express from 'express'

import { getShipmentClaims, openClaim, patchClaim } from '#logistics/shipping/claims/controller.ts'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/:id/claims', requireAdmin, getShipmentClaims)
router.post('/:id/claims', requireAdmin, openClaim)
router.patch('/:id/claims/:claim_id', requireAdmin, patchClaim)

export default router
