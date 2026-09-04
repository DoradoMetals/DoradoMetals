import { useMutation } from '@tanstack/react-query'
import type { CheckoutItem, Direction } from '@dorado/contracts'
import { apiRequest } from '@/shared/queries/axios'
import { useUser } from '@/features/auth/authClient'
import { useCheckoutItems } from '@/shared/store/checkoutItemsStore'
import { lineFromRow, toNewCheckoutItem, type CheckoutLine } from '@/features/checkout/items/types'

// The basket's whole server surface (ruling 50). PUT replaces - it IS the
// sync - and answers the rows now held. `user_id` is admin-only and names the
// customer an admin is ordering for.

// A top-level read, not a post-success effect (browser-triggered-effects.test.ts
// ALLOWED list) - hydration at sign-in, its own try/catch: a basket that will
// not hydrate keeps the local copy.
export const listCheckoutItems = async (direction: Direction, user_id?: string) => {
  const rows = await apiRequest<CheckoutItem[]>('GET', '/checkout/items', undefined, {
    direction,
    ...(user_id ? { user_id } : {}),
  })
  return rows.map(lineFromRow)
}

// Sign-in: the server's copy wins, browser-only lines survive.
export const hydrateCheckoutItems = async () => {
  for (const direction of ['sale', 'purchase'] as const) {
    try {
      useCheckoutItems.getState().merge(direction, await listCheckoutItems(direction))
    } catch (err) {
      console.error(`checkout items (${direction}) did not hydrate:`, err)
    }
  }
}

// THE BASKET'S WRITE SURFACE, AS MUTATIONS. A PUT/DELETE fires from the
// handler that changed the value - an add, a remove, an order just placed -
// never from an effect (browser-triggered-effects.test.ts: a mutation lives
// in `mutationFn`, called from a handler, not chained after one already
// succeeded and not fired by a background timer). `user_id` rides the
// mutation's own variables, not the hook's arguments, because the admin
// create flow only learns WHICH customer at call time.
export const useReplaceCheckoutItems = (direction: Direction) => {
  const { user } = useUser()
  return useMutation({
    mutationFn: async ({ lines, user_id }: { lines: CheckoutLine[]; user_id?: string }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      const rows = await apiRequest<CheckoutItem[]>(
        'PUT',
        '/checkout/items',
        { items: lines.map(toNewCheckoutItem) },
        { direction, ...(user_id ? { user_id } : {}) }
      )
      return rows.map(lineFromRow)
    },
    onSuccess: (rows, { user_id }) => {
      // An admin syncing a NAMED customer's basket must not overwrite the
      // caller's own local copy with someone else's rows.
      if (!user_id) useCheckoutItems.getState().setItems(direction, rows)
    },
  })
}

// Emptying the basket server-side, fired from the same handler that clears
// it locally - an order just placed, nothing left to hold.
export const useClearCheckoutItems = (direction: Direction) => {
  const { user } = useUser()
  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<{ removed: number }>('DELETE', '/checkout/items', undefined, {
        direction,
      })
    },
  })
}

// ONE HOOK, BOTH DIRECTIONS: every add/remove call site already names its
// own direction per line, so this keeps that shape - a call site swaps the
// store's own setters for these and the write reaches the server from the
// same click that changed the local copy.
export const useCheckoutItemActions = () => {
  const syncSale = useReplaceCheckoutItems('sale')
  const syncPurchase = useReplaceCheckoutItems('purchase')
  const syncFor = (direction: Direction) => (direction === 'sale' ? syncSale : syncPurchase)

  const addItem = (direction: Direction, line: CheckoutLine) => {
    useCheckoutItems.getState().addItem(direction, line)
    syncFor(direction).mutate({ lines: useCheckoutItems.getState()[direction] })
  }
  const removeOne = (direction: Direction, line: CheckoutLine) => {
    useCheckoutItems.getState().removeOne(direction, line)
    syncFor(direction).mutate({ lines: useCheckoutItems.getState()[direction] })
  }
  const removeAll = (direction: Direction, line: CheckoutLine) => {
    useCheckoutItems.getState().removeAll(direction, line)
    syncFor(direction).mutate({ lines: useCheckoutItems.getState()[direction] })
  }

  return { addItem, removeOne, removeAll }
}
