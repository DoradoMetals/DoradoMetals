import express from 'express'
import { completeFakeLink } from '#transactions/banks/controller.ts'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

// The fake provider's completion, mounted only where the fake answers and
// never in production (see plaid.fakeCompletionAllowed).
const router = express.Router()

router.post('/', requireAdmin, completeFakeLink)

export default router
