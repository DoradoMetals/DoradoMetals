import express from 'express'
import { listSpots } from '#pricing/spots/controller.ts'

const router = express.Router()

router.get('/', listSpots)

export default router
