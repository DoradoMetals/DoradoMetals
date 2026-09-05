import express from 'express'

import { setPassword } from '#identity/auth/controller.ts'
import { requireAuth } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.post('/set_password', requireAuth, setPassword)

export default router
