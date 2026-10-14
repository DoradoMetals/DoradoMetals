import express from 'express'
import type { NextFunction, Request, RequestHandler, Response } from 'express'

import {
  authFakes,
  changeEmail,
  changePhone,
  confirmChange,
  deleteAccount,
  getAccount,
  lastCode,
  patchAccount,
  sendCode,
  session,
  signUp,
  stepUp,
  verifyCode,
} from '#accounts/auth/controller.ts'
import { requireAdmin, requireUser } from '#shared/middleware/authMiddleware.ts'
import { isFake as smsIsFake } from '#providers/twilio/index.ts'
import { isFake as emailIsFake } from '#providers/resend/index.ts'

const router = express.Router()

const adminWhenQueried: RequestHandler = (req: Request, res: Response, next: NextFunction) =>
  req.query.number || req.query.email ? requireAdmin(req, res, next) : next()

router.post('/send_code', sendCode)
router.post('/verify_code', verifyCode)
router.post('/sign_up', signUp)
router.post('/step_up', requireUser, stepUp)
router.post('/change_email', requireUser, changeEmail)
router.post('/change_phone', requireUser, changePhone)
router.post('/confirm_change', requireUser, confirmChange)
router.get('/session', requireUser, session)
router.get('/me', requireUser, getAccount)
router.patch('/me', requireUser, patchAccount)
router.delete('/', requireUser, deleteAccount)

export const readsBackCodes =
  (smsIsFake() || emailIsFake()) && process.env.NODE_ENV !== 'production'
if (readsBackCodes) router.get('/last_code', adminWhenQueried, lastCode)

if (process.env.NODE_ENV !== 'production') router.get('/auth_fakes', authFakes)

export default router
