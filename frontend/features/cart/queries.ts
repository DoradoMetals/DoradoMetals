import { useMutation } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { cartStore } from '@/shared/store/cartStore'
import { useEffect } from 'react'
import { useGetSession } from '../auth/queries'
import { sellCartStore } from '@/shared/store/sellCartStore'
import { useSpotPrices } from '@/features/spots/queries'
import type { SellCartItem } from '@/features/cart/types'
import type { NewCheckoutItem } from '@dorado/contracts'
import type { Product } from '@/features/products/types'

// Both baskets are PUT /checkout/items?direction=, which replaces the session's
// lines. Only columns cross: content and premium are the server's.
export const buyLine = (product: Product): NewCheckoutItem => ({
  bullion_id: product.id,
  quantity: product.quantity ?? 1,
})

// A metal is a name here and an id on the wire. One unresolvable line makes the
// whole sync a no-op rather than a partial basket.
export function toSellLines(
  items: SellCartItem[],
  metals: { id: string; name: string }[]
): NewCheckoutItem[] | null {
  const out: NewCheckoutItem[] = []
  for (const item of items) {
    if (item.bullion_id !== null) {
      out.push({ bullion_id: item.bullion_id, quantity: item.quantity ?? 1 })
      continue
    }
    const metal_id = item.metal_id ?? metals.find((m) => m.name === item.metal)?.id
    if (!metal_id) return null
    out.push({
      metal_id,
      pre_melt: item.pre_melt,
      post_melt: item.post_melt,
      purity: item.purity,
      unit: item.unit,
      quantity: item.quantity ?? 1,
    })
  }
  return out
}

export const useSyncCartToBackend = () => {
  const { user } = useGetSession()

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Missing user')
      return await apiRequest(
        'PUT',
        '/checkout/items',
        { items: cartStore.getState().items.map(buyLine) },
        { direction: 'sale' }
      )
    },
  })
}

export const useSyncSellCartToBackend = () => {
  const { user } = useGetSession()
  const { data: metals = [] } = useSpotPrices()

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Missing user')
      const items = toSellLines(sellCartStore.getState().items, metals)
      if (!items) throw new Error('The metals reference has not loaded yet')
      return await apiRequest('PUT', '/checkout/items', { items }, { direction: 'purchase' })
    },
  })
}

export const useCartAutoSync = () => {
  const { user } = useGetSession()
  const syncCartMutation = useSyncCartToBackend()
  const syncSellCartMutation = useSyncSellCartToBackend()

  useEffect(() => {
    if (!user?.id) return
    const interval = setInterval(() => {
      syncCartMutation.mutate()
      syncSellCartMutation.mutate()
    }, 15000)

    return () => clearInterval(interval)
  }, [user?.id])
}
