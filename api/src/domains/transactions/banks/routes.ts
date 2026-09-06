import express from 'express'
import {
  createLinkToken,
  linkByMicroDeposits,
  linkFromPlaid,
  listBankLinks,
  recordVaultedLink,
  verifyMicroDeposits,
} from '#transactions/banks/controller.ts'
import { requireAdmin, requireUser } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/', requireUser, listBankLinks)
router.post('/link_token', requireUser, createLinkToken)
router.post('/vaulted', requireAdmin, recordVaultedLink)
router.post('/link', requireUser, linkFromPlaid)
router.post('/micro_deposits', requireUser, linkByMicroDeposits)
router.post('/:id/verify', requireUser, verifyMicroDeposits)

export default router
