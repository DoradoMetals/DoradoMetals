import * as orderAddresses from '#db/orders/addresses/repo.ts'
import * as placeAddresses from '#db/places/addresses/repo.ts'
import * as userAddresses from '#db/places/user-addresses/repo.ts'
import * as actionReasons from '#db/orders/action-reasons/repo.ts'
import * as addressService from '#accounts/places/addresses/service.ts'
import * as relabel from '#logistics/shipping/relabel.ts'
import * as orderRead from '#orders/read.ts'
import * as rules from '#orders/addresses/rules.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import type { Executor } from '#shared/db/executor.ts'

import type { OrderAddressChangeBody, OrderView } from '@dorado/contracts'

export type { OrderAddressLink } from '@dorado/contracts'

export async function snapshotFor(
  orderId: string,
  executor?: Executor
): Promise<Awaited<ReturnType<typeof placeAddresses.getOne>> | null> {
  const link = await orderAddresses.getFor(orderId, executor)
  if (!link) return null
  return (await placeAddresses.getOne(link.address_id, executor)) ?? null
}

type Carrier = Parameters<typeof relabel.relabel>[1]
type Buy = Parameters<typeof relabel.relabel>[2]

export async function change(
  order_id: string,
  body: OrderAddressChangeBody,
  voidTracking?: Carrier,
  buyInbound?: Buy,
  buyOutbound?: Buy
): Promise<OrderView> {
  const view = rules.assertOrder(order_id, await orderRead.view(order_id))
  const next = rules.assertAddress(body.address_id, await placeAddresses.getOne(body.address_id))
  rules.assertOwnedByCustomer(
    body.address_id,
    await userAddresses.getOne(body.address_id, rules.customerOf(view))
  )
  rules.assertRelabellable(view)
  rules.assertTaxStateHolds(view, next)

  await withTransaction(async (tx) => {
    const address_id = await addressService.snapshot(body.address_id, tx)
    await orderAddresses.create(
      { order_id, address_id: address_id!, source_address_id: body.address_id },
      tx
    )
    await relabel.retarget(view.shipments, address_id!, tx)
    await actionReasons.create({ order_id, action: 'change_address', reason: body.reason }, tx)
  })

  await relabel.relabel(view.shipments, voidTracking, buyInbound, buyOutbound)

  return rules.assertOrder(order_id, await orderRead.view(order_id))
}
