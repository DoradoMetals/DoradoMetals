'use client'

// THE BASKET IS SERVER STATE, ALWAYS (ruling 63: "Fuck it, go for it. We'll
// need it anyway." / "Frontend stores should be for UI elements, not data.").
//
// *** WHAT THIS FILE USED TO BE. *** A signed-out visitor had no
// `checkout.items` row - the endpoint is `requireUser` - so the browser kept a
// persisted zustand basket, `useBasket` answered the server's rows OR the local
// ones depending on who was signed in, and `hydrateCheckoutItems` merged the
// two on sign-in. Two copies of the same rows, a branch at every read, and a
// merge nobody could watch happen.
//
// *** WHAT IT IS NOW. *** A visitor gets an ANONYMOUS better-auth user on their
// first basket touch (`ensureSession` in `@dorado/client`), so the rows exist
// from the first line, for everyone. There is one copy, it is the server's, and
// signing in moves it on the SERVER (better-auth's `onLinkAccount` ->
// `domain/checkout/adopt.ts`) - so nothing here merges, hydrates or branches on
// a session.
//
// What is left is the two things `@dorado/client` deliberately does not know:
// which direction a surface is looking at, and the shape a component wants
// (`CheckoutLine` rather than the wire row).
import type { CheckoutItem, CheckoutItemPatch, Direction } from '@dorado/contracts'
import {
  useCheckoutItems as useServerCheckoutItems,
  useClearCheckoutItems as useClearServerItems,
  useReplaceCheckoutItems as useReplaceServerItems,
} from '@dorado/client'
import { useUser } from '@/shared/hooks/auth/authClient'
import { addLine, addOne, dropAll, dropOne } from '@/shared/utils/basket'

// WHAT A CHECKOUT SURFACE RENDERS: the server's rows, which carry the content,
// the premium and the snapshot the API took at PUT time.
//
// A READ NEVER MINTS AN IDENTITY - `enabled` on a session that already exists -
// so opening a page does not create a visitor; the first WRITE does. Somebody
// who has touched nothing has an empty basket, which is what this answers.
export const useBasket = (direction: Direction, user_id?: string): CheckoutItem[] => {
  const { user } = useUser()
  const { data: rows } = useServerCheckoutItems(direction, {
    enabled: !!(user_id ?? user?.id),
    user_id,
  })
  return rows ?? []
}

export const useReplaceCheckoutItems = (direction: Direction) =>
  useReplaceServerItems(direction)

export const useClearCheckoutItems = (direction: Direction) => useClearServerItems(direction)

// ONE HOOK, BOTH DIRECTIONS, called from the click that changed the basket - a
// product card's add button, a scrap declaration's remove.
//
// THE PUT IS THE WHOLE BASKET, because that endpoint replaces rather than
// merges: the new list is composed from the rows the server last answered with
// (items/basket.ts) and sent. The answer replaces the cache, so the count a
// card renders is the server's own, never a local guess that could drift.
export const useCheckoutItemActions = (user_id?: string) => {
  const sale = useBasket('sale', user_id)
  const purchase = useBasket('purchase', user_id)
  const syncSale = useReplaceCheckoutItems('sale')
  const syncPurchase = useReplaceCheckoutItems('purchase')

  const rowsFor = (direction: Direction) => (direction === 'sale' ? sale : purchase)
  const syncFor = (direction: Direction) => (direction === 'sale' ? syncSale : syncPurchase)

  const push = (direction: Direction, items: CheckoutItemPatch[]) =>
    syncFor(direction).mutate({ items, user_id })

  return {
    addItem: (direction: Direction, line: CheckoutItemPatch) =>
      push(direction, addLine(rowsFor(direction), line)),
    addOne: (direction: Direction, row: CheckoutItem) =>
      push(direction, addOne(rowsFor(direction), row.id)),
    removeOne: (direction: Direction, row: CheckoutItem) =>
      push(direction, dropOne(rowsFor(direction), row.id)),
    removeAll: (direction: Direction, row: CheckoutItem) =>
      push(direction, dropAll(rowsFor(direction), row.id)),
  }
}
