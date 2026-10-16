import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { refuseWith } from '#shared/http/refuse.ts'
import { oneString } from '#shared/http/query.ts'
import { uuidLike } from '#shared/http/validate.ts'
import * as locationService from '#accounts/places/locations/service.ts'

export const listLocations = asyncHandler(async (req, res) => {
  const organization_id = oneString(req.query.organization_id) ?? null
  if (organization_id !== null && !uuidLike.safeParse(organization_id).success) {
    refuseWith(400, '"organization_id" must be a uuid')
  }
  return res.json(await locationService.list(organization_id))
})
