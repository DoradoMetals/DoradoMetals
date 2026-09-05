import express from 'express'

import { getTransactionHistory } from '#transactions/ledger/controller.ts'

import { requireUser } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/', requireUser, getTransactionHistory)

export default router
