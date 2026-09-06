import express from 'express'

import { getAllRefiners } from '#refining/controller.ts'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/get_all', requireAdmin, getAllRefiners)

export default router
