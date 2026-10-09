import express from 'express'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'
import * as controller from '#crm/notes/controller.ts'

const router = express.Router()

router.get('/', requireAdmin, controller.getAll)
router.post('/', requireAdmin, controller.create)
router.patch('/:id', requireAdmin, controller.update)
router.delete('/:id', requireAdmin, controller.remove)

export default router
