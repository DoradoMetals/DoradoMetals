import express from 'express'

import { listEmployees } from '#accounts/employees/controller.ts'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/', requireAdmin, listEmployees)

export default router
