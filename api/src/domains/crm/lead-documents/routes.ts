import express from 'express'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'
import * as controller from '#crm/lead-documents/controller.ts'

const router = express.Router()

router.get('/:id/documents', requireAdmin, controller.getAll)
router.post(
  '/:id/documents',
  requireAdmin,
  express.raw({ type: 'multipart/form-data', limit: '25mb' }),
  controller.add
)
router.delete('/:id/documents/:pdfId', requireAdmin, controller.remove)

export default router
