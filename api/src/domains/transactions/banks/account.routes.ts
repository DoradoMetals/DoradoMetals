import express from 'express'
import {
  listCustomerBankLinks,
  resendBankLink,
  sendBankLink,
} from '#transactions/banks/controller.ts'
import { requireAdmin, requireUser } from '#shared/middleware/authMiddleware.ts'

// Ruling 160: a customer's linked accounts and the Hosted Link an admin sends.
const router = express.Router()

router.get('/:id/bank-links', requireUser, listCustomerBankLinks)
router.post('/:id/bank-links', requireAdmin, sendBankLink)
router.post('/:id/bank-links/:linkId/resend', requireAdmin, resendBankLink)

export default router
