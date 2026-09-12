import express from 'express'

import { list, listAdmins, getOne, patchUser } from '#accounts/users/controller.ts'
import { updateCredit } from '#transactions/credit/controller.ts'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/admins', requireAdmin, listAdmins)
router.get('/', requireAdmin, list)
router.get('/:id', requireAdmin, getOne)
router.patch('/:id', requireAdmin, patchUser)
router.post('/:id/credit', requireAdmin, updateCredit)

export default router
