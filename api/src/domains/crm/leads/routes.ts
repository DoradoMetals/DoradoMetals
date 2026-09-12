import express from 'express'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'
import { getOne, getAll, create, update, remove, convert } from '#crm/leads/controller.ts'

const router = express.Router()

router.get('/', requireAdmin, getAll)
router.post('/', requireAdmin, create)
router.get('/:id', requireAdmin, getOne)
router.patch('/:id', requireAdmin, update)
router.delete('/:id', requireAdmin, remove)
router.post('/:id/convert', requireAdmin, convert)

export default router
