import { RefinerItemPatch } from '@dorado/contracts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { parseStrict, uuidParam } from '#shared/http/validate.ts'
import * as refinerItemsService from '#orders/refiners/items/service.ts'

export const patchRefinerItem = asyncHandler(async (req, res) => {
  const orderItemId = uuidParam(req, 'orderItemId')
  const patch = parseStrict(RefinerItemPatch, req.body ?? {}, 'refiner item PATCH body')
  return res.status(200).json(await refinerItemsService.patchRefinerItem(orderItemId, patch))
})

export const getRefinerItemsByOrder = asyncHandler(async (req, res) => {
  return res.json(await refinerItemsService.forOrder(uuidParam(req, 'orderId')))
})
