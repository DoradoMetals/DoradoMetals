import express from 'express'
import {
  getSettings,
  listActiveSources,
  listAdjustmentHistory,
  listAdjustments,
  listLocks,
  listSources,
  listSpots,
  refreshSpots,
  removeAdjustment,
  setActiveSource,
  setAdjustment,
  updateSettings,
  updateSource,
} from '#pricing/spots/controller.ts'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/locks', requireAdmin, listLocks)
router.get('/settings', requireAdmin, getSettings)
router.patch('/settings', requireAdmin, updateSettings)
router.get('/sources', requireAdmin, listSources)
router.patch('/sources/:id', requireAdmin, updateSource)
router.get('/metals/active-sources', requireAdmin, listActiveSources)
router.patch('/metals/:metal_id/active-source', requireAdmin, setActiveSource)
router.get('/adjustments', requireAdmin, listAdjustments)
router.get('/adjustments/history', requireAdmin, listAdjustmentHistory)
router.patch('/adjustments/:metal_id/:source_id', requireAdmin, setAdjustment)
router.delete('/adjustments/:metal_id/:source_id', requireAdmin, removeAdjustment)
router.post('/refresh', requireAdmin, refreshSpots)
router.get('/', listSpots)

export default router
