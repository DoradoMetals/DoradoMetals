import express from 'express'
import { verifyRecaptcha } from '#identity/recaptcha/controller.ts'

const router = express.Router()

router.post('/verify-recaptcha', verifyRecaptcha)

export default router
