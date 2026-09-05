import express from 'express'

import handoffRoutes from '#logistics/shipping/handoffs/routes.ts'
import packageRoutes from '#logistics/shipping/packages/routes.ts'
import operationRoutes from '#logistics/shipping/operations/routes.ts'

const router = express.Router()

router.use('/handoffs', handoffRoutes)
router.use('/packages', packageRoutes)
router.use('/', operationRoutes)

export default router
