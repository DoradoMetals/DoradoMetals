import express from 'express'
import { listMints } from '#catalog/mints/controller.ts'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/', requireAdmin, listMints)

export default router
