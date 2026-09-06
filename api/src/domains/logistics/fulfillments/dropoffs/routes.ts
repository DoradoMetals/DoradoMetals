import express from 'express'

import { scheduleDropoff } from '#logistics/fulfillments/dropoffs/controller.ts'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.post('/schedule_dropoff', requireAdmin, scheduleDropoff)

export default router
