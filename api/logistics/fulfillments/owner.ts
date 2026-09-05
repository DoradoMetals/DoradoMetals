import { NotFound } from '#shared/errors.ts'
import * as checkoutService from '#checkout/service.ts'
import * as fulfillmentService from '#logistics/fulfillments/service.ts'
import type { Request } from 'express'

export async function requireFulfillmentOwner(req: Request, fulfillment_id: string): Promise<void> {
  if (req.user?.role === 'admin') return
  const caller = req.user?.id
  const owner =
    (await checkoutService.ownerOfFulfillment(fulfillment_id))?.user_id ??
    (await fulfillmentService.orderOwnerOf(fulfillment_id))
  if (!caller || owner !== caller) {
    throw new NotFound(`no such fulfillment: ${fulfillment_id}`)
  }
}
