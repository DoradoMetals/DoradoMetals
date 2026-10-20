import express from 'express'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'
import {
  getOne,
  getAll,
  create,
  update,
  remove,
  restore,
  convert,
  exportCsv,
  assign,
} from '#crm/leads/controller.ts'

const router = express.Router()

router.get('/', requireAdmin, getAll)
router.post('/', requireAdmin, create)
router.get('/export', requireAdmin, exportCsv)
router.post('/assign', requireAdmin, assign)
router.get('/:id', requireAdmin, getOne)
router.patch('/:id', requireAdmin, update)
router.delete('/:id', requireAdmin, remove)
router.post('/:id/restore', requireAdmin, restore)
router.post('/:id/convert', requireAdmin, convert)

export default router
