import express from 'express'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'
import { getOne, getAll, getPublic, create, update, remove } from '#crm/reviews/controller.ts'

const router = express.Router()

router.get('/public', getPublic)

router.get('/', requireAdmin, getAll)
router.post('/', requireAdmin, create)
router.get('/:id', requireAdmin, getOne)
router.patch('/:id', requireAdmin, update)
router.delete('/:id', requireAdmin, remove)

export default router
