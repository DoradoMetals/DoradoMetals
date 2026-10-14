import express from 'express'

import { isFake as smsIsFake } from '#providers/twilio/index.ts'
import { isFake as emailIsFake } from '#providers/resend/index.ts'
import { listMessages, showMessage } from '#accounts/messages/controller.ts'

const router = express.Router()

export const messagesEnabled =
  (smsIsFake() || emailIsFake()) && process.env.NODE_ENV !== 'production'
if (messagesEnabled) {
  router.get('/messages', listMessages)
  router.get('/messages/:message_id', showMessage)
}

export default router
