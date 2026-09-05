import express from 'express'

import { uploadImage, getUrl, deleteImage, getTestImages } from '#media/images/controller.ts'

import { requireUser, requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.post('/', requireUser, uploadImage)
router.get('/', requireAdmin, getTestImages)
router.get('/:id/url', requireUser, getUrl)
router.delete('/:id', requireUser, deleteImage)

export default router
