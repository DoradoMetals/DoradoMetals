import express from 'express'

import { getAllRefiners } from '#orders/refiners/controller.ts'

import { requireAdmin } from '#shared/middleware/authMiddleware.ts'
const router = express.Router()

router.get('/get_all', requireAdmin, getAllRefiners)

export default router
