import express from 'express'

import { listLocations } from '#accounts/places/locations/controller.ts'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/', requireAdmin, listLocations)

export default router
