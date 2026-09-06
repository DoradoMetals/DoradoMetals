import { checkouts, checkoutItems, fulfillmentPickups, shipments, userAddresses } from '#db'
import withTransaction from '#shared/db/withTransaction.ts'
import * as rules from '#checkout/rules.ts'
import { attempt } from '#shared/attempt.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { CheckoutAdoption, CheckoutAdoptionResult } from '@dorado/contracts'

export async function adoptAnonymousCheckout(
  anonymousUserId: string,
  userId: string,
  tx: Executor
): Promise<CheckoutAdoptionResult> {
  if (!anonymousUserId || !userId || anonymousUserId === userId) {
    return { adopted: [], addresses: 0, parcels: 0 }
  }
  return await adopt(anonymousUserId, userId, tx)
}

export const adoptAnonymousCheckoutQuietly = (
  anonymousUserId: string,
  userId: string
): Promise<CheckoutAdoptionResult | undefined> =>
  attempt("carry a visitor's basket onto their new account", () =>
    withTransaction((tx) => adoptAnonymousCheckout(anonymousUserId, userId, tx))
  )

async function adopt(
  anonymousUserId: string,
  userId: string,
  client: Executor
): Promise<CheckoutAdoptionResult> {
  await checkouts.deferAddressOwnership(client)
  await shipments.deferAddressOwnership(client)
  await fulfillmentPickups.deferAddressOwnership(client)

  // The book, the basket and the PARCEL move together. 137's composite key
  // holds a parcel's address to its owner's book, so a visitor's parcels have
  // to change hands in the same transaction the book does.
  const addresses = await userAddresses.reassign(anonymousUserId, userId, client)
  const parcels =
    (await shipments.reassignOwner(anonymousUserId, userId, client)) +
    (await fulfillmentPickups.reassignOwner(anonymousUserId, userId, client))

  const moved: CheckoutAdoption[] = []
  for (const visitor of await checkouts.listFor(anonymousUserId, client)) {
    const mine = await checkouts.findFor(userId, visitor.direction, client)

    if (!mine) {
      const rekeyed = await checkouts.reassign(visitor.id, userId, client)
      rules.assertRekeyed(rekeyed, visitor.id, userId)
      moved.push({
        direction: visitor.direction,
        outcome: 'moved',
        checkout_id: visitor.id,
        replaced: 0,
      })
      continue
    }

    const patch = rules.mergeChoices(visitor, mine)
    if (Object.keys(patch).length > 0) await checkouts.update(mine.id, patch, client)

    let replaced = 0
    const lines = await checkoutItems.listFor(visitor.id, client)
    if (lines.length > 0) {
      replaced = await checkoutItems.removeFor(mine.id, client)
      const carried = await checkoutItems.reassign(visitor.id, mine.id, client)
      rules.assertLinesCarried(carried, lines.length, visitor.id)
    }

    const removed = await checkouts.remove(visitor.id, client)
    rules.assertVisitorRowGone(removed, visitor.id, mine.id)
    moved.push({
      direction: visitor.direction,
      outcome: 'merged',
      checkout_id: mine.id,
      replaced,
    })
  }

  return { adopted: moved, addresses, parcels }
}
