import express from 'express'
import {
  getSettings,
  listLocks,
  listSpots,
  removeOverride,
  setOverride,
  updateSettings,
} from '#pricing/spots/controller.ts'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/locks', requireAdmin, listLocks)
router.get('/settings', requireAdmin, getSettings)
router.patch('/settings', requireAdmin, updateSettings)
router.get('/', listSpots)
router.post('/:metal_id/override', requireAdmin, setOverride)
router.delete('/:metal_id/override', requireAdmin, removeOverride)

export default router
