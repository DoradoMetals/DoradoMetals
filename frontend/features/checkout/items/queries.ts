'use client'

// THE BASKET, WHICH IS SERVER STATE THE MOMENT SOMEBODY SIGNS IN.
//
// `@dorado/client` owns every call; this file owns the ONE thing it cannot:
// a signed-out visitor has no `checkout.items` row, because the endpoint is
// `requireUser`. So the zustand store below is the ANONYMOUS basket and
// nothing else - a signed-in surface reads `useBasket`, which answers the
// server's rows, and every add/remove is a PUT from the handler that made it.
//
// No effect syncs the two. Sign-in merges once (`hydrateCheckoutItems`, called
// from the auth flow's own success handler), and after that the server is the
// only copy a checkout surface renders.
import type { Direction } from '@dorado/contracts'
import {
  fetchCheckoutItems,
  useCheckoutItems as useServerCheckoutItems,
  useClearCheckoutItems as useClearServerItems,
  useReplaceCheckoutItems as useReplaceServerItems,
} from '@dorado/client'
import { useUser } from '@/features/auth/authClient'
import { useCheckoutItems as useLocalBasket } from '@/shared/store/checkoutItemsStore'
import { lineFromRow, toNewCheckoutItem, type CheckoutLine } from '@/features/checkout/items/types'

// Sign-in: the server's copy wins, browser-only lines survive. A top-level
// read, not a post-success effect - the auth flow calls it from its own
// handler, and a basket that will not hydrate keeps the local copy.
export const hydrateCheckoutItems = async () => {
  for (const direction of ['sale', 'purchase'] as const) {
    const rows = await fetchCheckoutItems(direction).catch(() => null)
    if (rows) useLocalBasket.getState().merge(direction, rows.map(lineFromRow))
  }
}

// WHAT A CHECKOUT SURFACE RENDERS. Signed in: the server's rows, which carry
// the content, the premium and the snapshot the API took at PUT time. Signed
// out: the local basket, which is all there is.
export const useBasket = (direction: Direction): CheckoutLine[] => {
  const { user } = useUser()
  const local = useLocalBasket((state) => state[direction])
  const { data: rows } = useServerCheckoutItems(direction, { enabled: !!user?.id })
  return user?.id ? (rows ?? []).map(lineFromRow) : local
}

export const useReplaceCheckoutItems = (direction: Direction) => {
  const { user } = useUser()
  const mutation = useReplaceServerItems(direction)
  return {
    ...mutation,
    mutate: (vars: { lines: CheckoutLine[]; user_id?: string }) => {
      if (!user?.id) return
      mutation.mutate({ items: vars.lines.map(toNewCheckoutItem), user_id: vars.user_id })
    },
    mutateAsync: async (vars: { lines: CheckoutLine[]; user_id?: string }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await mutation.mutateAsync({
        items: vars.lines.map(toNewCheckoutItem),
        user_id: vars.user_id,
      })
    },
  }
}

export const useClearCheckoutItems = (direction: Direction) => useClearServerItems(direction)

// ONE HOOK, BOTH DIRECTIONS, called from the click that changed the basket -
// a product card's add button, a scrap declaration's remove. The local copy
// moves first so an anonymous visitor sees the change; a signed-in one PUTs
// the whole basket, and the answer replaces the query cache.
export const useCheckoutItemActions = () => {
  const { user } = useUser()
  const syncSale = useReplaceServerItems('sale')
  const syncPurchase = useReplaceServerItems('purchase')
  const syncFor = (direction: Direction) => (direction === 'sale' ? syncSale : syncPurchase)

  const push = (direction: Direction) => {
    if (!user?.id) return
    syncFor(direction).mutate({
      items: useLocalBasket.getState()[direction].map(toNewCheckoutItem),
    })
  }

  return {
    addItem: (direction: Direction, line: CheckoutLine) => {
      useLocalBasket.getState().addItem(direction, line)
      push(direction)
    },
    removeOne: (direction: Direction, line: CheckoutLine) => {
      useLocalBasket.getState().removeOne(direction, line)
      push(direction)
    },
    removeAll: (direction: Direction, line: CheckoutLine) => {
      useLocalBasket.getState().removeAll(direction, line)
      push(direction)
    },
  }
}
