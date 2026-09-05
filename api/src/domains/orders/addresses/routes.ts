import express from 'express'

import { getOrderAddress } from '#orders/addresses/controller.ts'
import { requireUser } from '#shared/middleware/authMiddleware.ts'
import { requireOwnOrderParam } from '#shared/middleware/ownership.ts'

const router = express.Router()

router.get('/:id/address', requireUser, requireOwnOrderParam, getOrderAddress)

export default router
