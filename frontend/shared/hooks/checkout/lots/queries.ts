'use client'

// THE BASKET IS SERVER STATE, ALWAYS (ruling 63: "Fuck it, go for it. We'll
// need it anyway." / "Frontend stores should be for UI elements, not data.").
//
// *** WHAT THIS FILE USED TO BE. *** A signed-out visitor had no basket row -
// the endpoint is `requireUser` - so the browser kept a persisted zustand
// basket, `useBasket` answered the server's rows OR the local ones depending on
// who was signed in, and a merge ran on sign-in. Two copies of the same rows, a
// branch at every read, and a merge nobody could watch happen.
//
// *** WHAT IT IS NOW. *** A visitor gets an ANONYMOUS better-auth user on their
// first basket touch (`ensureSession` in `@dorado/client`), so the rows exist
// from the first line, for everyone. There is one copy, it is the server's, and
// signing in moves it on the SERVER (better-auth's `onLinkAccount` ->
// `domain/checkout/adopt.ts`) - so nothing here merges, hydrates or branches on
// a session.
//
// *** AND THE LINE IS A LOT (docs/waves/lots-build.md). *** `checkout.items` is
// gone from every read path: the basket is `checkout.lots` pointing at
// `lots.items`, so a row here is a `Lot` and the PUT body key is `lots`.
//
// What is left is the two things `@dorado/client` deliberately does not know:
// which direction a surface is looking at, and the shape a component wants.
import type { CheckoutLotPatch, Direction, Lot } from '@dorado/contracts'
import {
  useCheckoutLots as useServerCheckoutLots,
  useClearCheckoutLots as useClearServerLots,
  useReplaceCheckoutLots as useReplaceServerLots,
} from '@dorado/client'
import { useUser } from '@/shared/hooks/auth/authClient'
import { addLine, addOne, dropAll, dropOne } from '@/shared/utils/basket'

// WHAT A CHECKOUT SURFACE RENDERS: the server's rows, which carry the content,
// the weights and the snapshot the API took at PUT time.
//
// A READ NEVER MINTS AN IDENTITY - `enabled` on a session that already exists -
// so opening a page does not create a visitor; the first WRITE does. Somebody
// who has touched nothing has an empty basket, which is what this answers.
export const useBasket = (direction: Direction, user_id?: string): Lot[] => {
  const { user } = useUser()
  const { data: rows } = useServerCheckoutLots(direction, {
    enabled: !!(user_id ?? user?.id),
    user_id,
  })
  return rows ?? []
}

export const useReplaceCheckoutLots = (direction: Direction) => useReplaceServerLots(direction)

export const useClearCheckoutLots = (direction: Direction) => useClearServerLots(direction)

// ONE HOOK, BOTH DIRECTIONS, called from the click that changed the basket - a
// product card's add button, a scrap declaration's remove.
//
// THE PUT IS THE WHOLE BASKET, because that endpoint replaces rather than
// merges: the new list is composed from the rows the server last answered with
// (utils/basket.ts) and sent. The answer replaces the cache, so the count a
// card renders is the server's own, never a local guess that could drift.
export const useCheckoutLotActions = (user_id?: string) => {
  const sale = useBasket('sale', user_id)
  const purchase = useBasket('purchase', user_id)
  const syncSale = useReplaceCheckoutLots('sale')
  const syncPurchase = useReplaceCheckoutLots('purchase')

  const rowsFor = (direction: Direction) => (direction === 'sale' ? sale : purchase)
  const syncFor = (direction: Direction) => (direction === 'sale' ? syncSale : syncPurchase)

  const push = (direction: Direction, lots: CheckoutLotPatch[]) =>
    syncFor(direction).mutate({ lots, user_id })

  return {
    addItem: (direction: Direction, line: CheckoutLotPatch) =>
      push(direction, addLine(rowsFor(direction), line)),
    addOne: (direction: Direction, row: Lot) => push(direction, addOne(rowsFor(direction), row.id)),
    removeOne: (direction: Direction, row: Lot) =>
      push(direction, dropOne(rowsFor(direction), row.id)),
    removeAll: (direction: Direction, row: Lot) =>
      push(direction, dropAll(rowsFor(direction), row.id)),
  }
}
