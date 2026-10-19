import express from 'express'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'
import * as controller from '#crm/estimates/controller.ts'

const router = express.Router()

router.get('/:id/estimate/items', requireAdmin, controller.getAll)
router.post('/:id/estimate/items', requireAdmin, controller.create)
router.patch('/:id/estimate/items/:itemId', requireAdmin, controller.update)
router.delete('/:id/estimate/items/:itemId', requireAdmin, controller.remove)
router.get('/:id/estimate/items/:itemId/images', requireAdmin, controller.getImages)
router.post('/:id/estimate/items/:itemId/images', requireAdmin, controller.addImage)
router.delete('/:id/estimate/items/:itemId/images/:imageId', requireAdmin, controller.removeImage)

export default router
