import { Direction } from '@dorado/contracts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as methodsService from '#payments/methods/service.ts'
import { oneString } from '#shared/http/query.ts'
import { parseStrict } from '#shared/http/validate.ts'

export const getMethods = asyncHandler(async (req, res) => {
  const raw = oneString(req.query.direction)
  const direction = raw == null ? null : parseStrict(Direction, raw, 'direction')
  const result = await methodsService.getMethods(direction)
  return res.status(200).json(result)
})
