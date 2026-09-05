import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as spotService from '#pricing/spots/service.ts'

export const listSpots = asyncHandler(async (_req, res) => {
  res.status(200).json(await spotService.listTicker())
})
