import { useEffect } from 'react'
import type { CheckoutItem, Direction } from "@dorado/contracts";
import { apiRequest } from '@/shared/queries/axios'
import { useUser } from '@/features/auth/authClient'
import { useCheckoutItems } from '@/shared/store/checkoutItemsStore'
import { lineFromRow, toNewCheckoutItem, type CheckoutLine } from '@/features/checkout/items/types'

// The basket's whole server surface (ruling 50). PUT replaces - it IS the
// sync - and answers the rows now held. `user_id` is admin-only and names the
// customer an admin is ordering for.

export const listCheckoutItems = async (direction: Direction, user_id?: string) => {
  const rows = await apiRequest<CheckoutItem[]>('GET', '/checkout/items', undefined, {
    direction,
    ...(user_id ? { user_id } : {}),
  })
  return rows.map(lineFromRow)
}

export const replaceCheckoutItems = async (
  direction: Direction,
  lines: CheckoutLine[],
  user_id?: string
) => {
  const rows = await apiRequest<CheckoutItem[]>(
    'PUT',
    '/checkout/items',
    { items: lines.map(toNewCheckoutItem) },
    { direction, ...(user_id ? { user_id } : {}) }
  )
  return rows.map(lineFromRow)
}

export const clearCheckoutItems = (direction: Direction, user_id?: string) =>
  apiRequest<{ removed: number }>('DELETE', '/checkout/items', undefined, {
    direction,
    ...(user_id ? { user_id } : {}),
  })

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

export const pushCheckoutItems = (direction: Direction) =>
  replaceCheckoutItems(direction, useCheckoutItems.getState()[direction])

export const useCheckoutItemsAutoSync = () => {
  const { user } = useUser()

  useEffect(() => {
    if (!user?.id) return
    const interval = setInterval(() => {
      void pushCheckoutItems('sale').catch(() => {})
      void pushCheckoutItems('purchase').catch(() => {})
    }, 15000)
    return () => clearInterval(interval)
  }, [user?.id])
}
