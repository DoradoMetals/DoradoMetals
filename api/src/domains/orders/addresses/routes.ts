import express from 'express'

import { changeOrderAddress, getOrderAddress } from '#orders/addresses/controller.ts'
import { requireAdmin, requireUser } from '#shared/middleware/authMiddleware.ts'
import { requireOwnOrderParam } from '#shared/middleware/ownership.ts'

const router = express.Router()

router.get('/:id/address', requireUser, requireOwnOrderParam, getOrderAddress)
router.post('/:id/address', requireAdmin, changeOrderAddress)

export default router
