import * as checkoutService from '#checkout/service.ts'
import * as fulfillmentService from '#logistics/fulfillments/service.ts'
import * as rules from '#logistics/fulfillments/rules.ts'
import type { Request } from 'express'

export async function requireFulfillmentOwner(req: Request, fulfillment_id: string): Promise<void> {
  if (req.user?.role === 'admin') return
  const owner =
    (await checkoutService.ownerOfFulfillment(fulfillment_id))?.user_id ??
    (await fulfillmentService.orderOwnerOf(fulfillment_id))
  rules.assertOwnedDraft(owner, req.user?.id ?? null, fulfillment_id)
}
