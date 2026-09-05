import * as addressService from '#identity/places/addresses/service.ts'
import * as checkoutService from '#checkout/service.ts'
import * as fulfillmentService from '#logistics/fulfillments/service.ts'
import * as methodService from '#logistics/fulfillments/methods/service.ts'
import * as handoffsService from '#logistics/shipping/handoffs/service.ts'
import * as rules from '#logistics/fulfillments/rules.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { Direction, FulfillmentCreateBody, FulfillmentView } from '@dorado/contracts'

async function methodFor(
  { method_id, handoff_code }: Omit<FulfillmentCreateBody, 'checkout_id'>,
  direction: Direction,
  executor?: Executor
): Promise<string> {
  if (method_id) {
    await methodService.assertOffered(method_id, direction, executor)
    return method_id
  }
  if (!handoff_code) {
    return (await methodService.getDefault(direction, 'SHIPMENT', executor)).id
  }
  const handoff = (await handoffsService.getHandoffs(null, executor)).find(
    (h) => h.code === handoff_code
  )
  rules.assertHandoff(handoff, handoff_code)
  const type = rules.methodTypeFor(handoff)
  const offered = await methodService.listAvailable(direction, executor)
  const chosen = offered.find((m) => m.type === type)?.id
  rules.assertOfferedType(chosen, type, direction)
  return chosen
}

export async function createForCheckout(
  body: FulfillmentCreateBody,
  caller_id: string,
  is_admin: boolean,
  tx: Executor
): Promise<FulfillmentView> {
  const row = await checkoutService.getRowById(body.checkout_id, tx)
  rules.assertFulfillment(row, body.checkout_id)
  rules.assertOwnedDraft(row.user_id, is_admin ? row.user_id : caller_id, body.checkout_id)

  const direction = row.direction
  const method_id = await methodFor(body, direction, tx)

  if (row.fulfillment_id) {
    return await withDefaultAddress(
      await fulfillmentService.setMethod(row.fulfillment_id, method_id, tx),
      row.user_id,
      tx
    )
  }
  const draft = await fulfillmentService.createDraft(method_id, direction, tx)
  await checkoutService.attachFulfillment(row.id, draft.fulfillment.id, tx)
  return await withDefaultAddress(draft, row.user_id, tx)
}

async function withDefaultAddress(
  view: FulfillmentView,
  user_id: string,
  executor?: Executor
): Promise<FulfillmentView> {
  const category = view.method.category
  if (category === 'DIRECT') return view
  if (category === 'SHIPMENT' && view.parcel?.shipper_address_id) return view
  if (category === 'PICKUP' && view.pickup?.pickup_address_id) return view

  const book = await addressService.list(user_id, executor)
  const preferred =
    book.find((e) => e.user_address.default_shipping && e.address.is_valid) ??
    book.find((e) => e.address.is_valid)
  if (!preferred) return view

  return await fulfillmentService.patchChoices(
    view.fulfillment.id,
    category === 'SHIPMENT'
      ? { shipment: { shipper_address_id: preferred.address.id } }
      : { pickup: { pickup_address_id: preferred.address.id } },
    executor
  )
}
