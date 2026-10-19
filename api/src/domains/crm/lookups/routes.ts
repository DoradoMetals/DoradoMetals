import express from 'express'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'
import * as controller from '#crm/lookups/controller.ts'

const router = express.Router()

router.get('/sources', requireAdmin, controller.sources)
router.get('/estimate-kinds', requireAdmin, controller.estimateKinds)
router.get('/contact-preferences', requireAdmin, controller.contactPreferences)
router.get('/weight-units', requireAdmin, controller.weightUnits)
router.get('/purities', requireAdmin, controller.purities)

export default router
