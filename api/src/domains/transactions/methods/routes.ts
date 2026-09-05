import express from 'express'

import { getMethods } from '#transactions/methods/controller.ts'

const router = express.Router()

router.get('/', getMethods)

export default router
