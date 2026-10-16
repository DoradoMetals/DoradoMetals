import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { uuidParam } from '#shared/http/validate.ts'
import { strictBody } from '#shared/http/validate.ts'
import { OrderAddressChangeBody } from '@dorado/contracts'
import * as orderAddressService from '#orders/addresses/service.ts'

export const getOrderAddress = asyncHandler(async (req, res) => {
  const id = uuidParam(req, 'id')
  const snapshot = await orderAddressService.snapshotFor(id)
  if (!snapshot) {
    return res.status(404).json({
      error: 'Not Found',
      message: `order ${id} has no address`,
    })
  }
  return res.json(snapshot)
})

export const changeOrderAddress = asyncHandler(async (req, res) => {
  const body = strictBody(OrderAddressChangeBody, req.body)
  return res.status(200).json(await orderAddressService.change(uuidParam(req, 'id'), body))
})
