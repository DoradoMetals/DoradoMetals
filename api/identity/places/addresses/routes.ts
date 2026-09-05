import express from 'express'

import {
  list,
  getOne,
  create,
  update,
  remove,
  setDefault,
  suggest,
  lookup,
} from '#identity/places/addresses/controller.ts'
import { requireUser } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/suggestions', requireUser, suggest)
router.get('/suggestions/:place_id', requireUser, lookup)

router.get('/', requireUser, list)
router.post('/', requireUser, create)
router.get('/:id', requireUser, getOne)
router.patch('/:id', requireUser, update)
router.delete('/:id', requireUser, remove)
router.post('/:id/default', requireUser, setDefault)

export default router
