import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as locationService from '#accounts/places/locations/service.ts'

export const listLocations = asyncHandler(async (_req, res) => {
  return res.json(await locationService.list())
})
