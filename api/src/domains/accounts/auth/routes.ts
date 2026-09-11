import express from 'express'

import {
  changeEmail,
  changePhone,
  confirmChange,
  lastCode,
  sendCode,
  session,
  signUp,
  stepUp,
  verifyCode,
} from '#accounts/auth/controller.ts'
import { requireUser } from '#shared/middleware/authMiddleware.ts'
import { isFake as smsIsFake } from '#providers/sms/index.ts'
import { isFake as emailIsFake } from '#providers/emails/index.ts'

const router = express.Router()

router.post('/send_code', sendCode)
router.post('/verify_code', verifyCode)
router.post('/sign_up', signUp)
router.post('/step_up', requireUser, stepUp)
router.post('/change_email', requireUser, changeEmail)
router.post('/change_phone', requireUser, changePhone)
router.post('/confirm_change', requireUser, confirmChange)
router.get('/session', requireUser, session)

// The e2e read-back. Decided once, at mount time, so a real deployment has no
// route to reach at all rather than a guard that could be got past.
export const readsBackCodes =
  (smsIsFake() || emailIsFake()) && process.env.NODE_ENV !== 'production'
if (readsBackCodes) router.get('/last_code', lastCode)

export default router
