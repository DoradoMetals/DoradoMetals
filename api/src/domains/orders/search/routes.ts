import express from 'express'

import { searchEverything } from '#orders/controller.ts'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/', requireAdmin, searchEverything)

export default router
