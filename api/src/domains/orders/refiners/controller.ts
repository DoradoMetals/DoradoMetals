import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as refinerService from '#orders/refiners/service.ts'

export const getAllRefiners = asyncHandler(async (req, res) => {
  const refiners = await refinerService.getAllRefiners()
  return res.json(refiners)
})
