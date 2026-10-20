import express from 'express'
import { listFundingSources } from '#transactions/funding/controller.ts'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/', requireAdmin, listFundingSources)

export default router
