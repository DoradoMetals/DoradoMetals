import express from 'express'
import {
  cancelAdjustment,
  freezeAll,
  getMetal,
  getSettings,
  listActiveSources,
  listAdjustmentHistory,
  listAdjustments,
  listLocks,
  listSources,
  listSpots,
  listTicker,
  metalActivity,
  metalCandles,
  refreshSpots,
  removeAdjustment,
  setAdjustment,
  setMetalSource,
  streamSpots,
  unlockLock,
  updateSettings,
  updateSource,
} from '#pricing/spots/controller.ts'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/locks', requireAdmin, listLocks)
router.post('/locks/:id/unlock', requireAdmin, unlockLock)
router.get('/settings', requireAdmin, getSettings)
router.patch('/settings', requireAdmin, updateSettings)
router.get('/sources', requireAdmin, listSources)
router.patch('/sources/:id', requireAdmin, updateSource)
router.get('/metals/active-sources', requireAdmin, listActiveSources)
router.get('/metals/:metal_id', requireAdmin, getMetal)
router.get('/metals/:metal_id/activity', requireAdmin, metalActivity)
router.get('/metals/:metal_id/candles', metalCandles)
router.patch('/metals/:metal_id/source', requireAdmin, setMetalSource)
router.get('/adjustments', requireAdmin, listAdjustments)
router.get('/adjustments/history', requireAdmin, listAdjustmentHistory)
router.patch('/adjustments/:metal_id/:source_id', requireAdmin, setAdjustment)
router.delete('/adjustments/:metal_id/:source_id', requireAdmin, removeAdjustment)
router.delete('/adjustments/:metal_id', requireAdmin, cancelAdjustment)
router.post('/freeze', requireAdmin, freezeAll)
router.post('/refresh', requireAdmin, refreshSpots)
router.get('/ticker', listTicker)
router.get('/stream', streamSpots)
router.get('/', listSpots)

export default router
