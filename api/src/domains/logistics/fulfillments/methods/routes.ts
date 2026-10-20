import express from 'express'

import {
  getAllMethods,
  getMethods,
  getRefinerMethods,
} from '#logistics/fulfillments/methods/controller.ts'

import { requireAdmin, requireUser } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/', requireUser, getMethods)
router.get('/all', requireAdmin, getAllMethods)
router.get('/refiner', requireAdmin, getRefinerMethods)

export default router
