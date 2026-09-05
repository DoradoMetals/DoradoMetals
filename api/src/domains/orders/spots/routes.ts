import express from 'express'

import { getOrderSpots, putOrderSpots } from '#orders/spots/controller.ts'

import { requireUser, requireAdmin } from '#shared/middleware/authMiddleware.ts'
import { requireOwnOrderParam } from '#shared/middleware/ownership.ts'

const router = express.Router()

router.get('/:id/spots', requireUser, requireOwnOrderParam, getOrderSpots)

router.put('/:id/spots', requireAdmin, putOrderSpots)

export default router
