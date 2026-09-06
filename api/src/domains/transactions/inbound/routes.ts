import express from 'express'
import {
  confirmMatch,
  listCandidates,
  listUnmatched,
  recordWire,
  syncFeed,
  unmatch,
} from '#transactions/inbound/controller.ts'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/unmatched', requireAdmin, listUnmatched)
router.get('/candidates', requireAdmin, listCandidates)
router.post('/wire', requireAdmin, recordWire)
router.post('/sync', requireAdmin, syncFeed)
router.post('/:id/match', requireAdmin, confirmMatch)
router.post('/:id/unmatch', requireAdmin, unmatch)

export default router
