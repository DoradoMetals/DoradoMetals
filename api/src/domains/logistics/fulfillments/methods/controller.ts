import { isStaff } from '#shared/middleware/authMiddleware.ts'
import { Direction } from '@dorado/contracts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { parseStrict } from '#shared/http/validate.ts'
import * as methodService from '#logistics/fulfillments/methods/service.ts'

export const getMethods = asyncHandler(async (req, res) => {
  const direction = parseStrict(Direction, req.query.direction, 'direction')
  const staff = isStaff(req)
  return res.status(200).json(await methodService.listAvailable(direction, undefined, staff))
})

export const getRefinerMethods = asyncHandler(async (_req, res) => {
  return res.status(200).json(await methodService.listRefiner())
})

export const getAllMethods = asyncHandler(async (_req, res) => {
  return res.status(200).json(await methodService.listAll())
})
