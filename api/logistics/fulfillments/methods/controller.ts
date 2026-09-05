import { Direction, FulfillmentMethodUpdateBody } from '@dorado/contracts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { parseStrict } from '#shared/http/validate.ts'
import * as methodService from '#logistics/fulfillments/methods/service.ts'

export const getMethods = asyncHandler(async (req, res) => {
  const direction = parseStrict(Direction, req.query.direction, 'direction')
  return res.status(200).json(await methodService.listAvailable(direction))
})

export const getAllMethods = asyncHandler(async (_req, res) => {
  return res.status(200).json(await methodService.listAll())
})

export const updateMethod = asyncHandler(async (req, res) => {
  const body = parseStrict(
    FulfillmentMethodUpdateBody,
    req.body,
    'fulfillments/methods/update body'
  )
  return res.status(200).json(await methodService.update(body.id, body.method))
})
