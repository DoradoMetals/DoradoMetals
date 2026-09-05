import * as orderAddresses from '#db/orders/addresses/repo.ts'
import * as placeAddresses from '#db/places/addresses/repo.ts'
import type { Executor } from '#shared/db/executor.ts'

export type { OrderAddressLink } from '@dorado/contracts'

export async function snapshotFor(
  orderId: string,
  executor?: Executor
): Promise<Awaited<ReturnType<typeof placeAddresses.getOne>> | null> {
  const link = await orderAddresses.getFor(orderId, executor)
  if (!link) return null
  return (await placeAddresses.getOne(link.address_id, executor)) ?? null
}
