import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as metalService from '#pricing/metals/service.ts'

export const listMetals = asyncHandler(async (_req, res) => {
  res.status(200).json(await metalService.listMetals())
})

export const listPurityLabels = asyncHandler(async (_req, res) => {
  res.status(200).json(await metalService.listPurityLabels())
})
