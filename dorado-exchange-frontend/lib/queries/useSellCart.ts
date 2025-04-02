import { useMutation, useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useUserStore } from '@/store/userStore'
import { sellCartStore } from '@/store/sellCartStore'
import { useEffect } from 'react'
import { SellCartItem } from '@/types/sellCart'

export const useHydrateSellCartFromBackend = () => {
  const { user } = useUserStore()
  const mergeSellCart = sellCartStore((state) => state.mergeSellCart)

  const query = useQuery<SellCartItem[], Error>({
    queryKey: ['sell-cart', user?.id],
    queryFn: async () => {
      return await apiRequest<SellCartItem[]>('GET', '/sell_cart/get_sell_cart', undefined, {
        user_id: user.id,
      })
    },
    enabled: !!user?.id,
  })

  useEffect(() => {
    if (query.data) {
      mergeSellCart(query.data)
    }
  }, [query.data, mergeSellCart])

  return query
}

export const useSyncSellCartToBackend = () => {
  const { user } = useUserStore()

  return useMutation({
    mutationFn: async () => {
      const items = sellCartStore.getState().items

      if (!user?.id || items.length === 0) {
        throw new Error('Missing user or cart is empty')
      }

      return await apiRequest('POST', '/sell_cart/sync_sell_cart', {
        user_id: user.id,
        cart: items,
      })
    },
  })
}

export const useSellCartAutoSync = () => {
  const { user } = useUserStore()
  const syncMutation = useSyncSellCartToBackend()

  useEffect(() => {
    if (!user?.id) return
    const interval = setInterval(() => {
      syncMutation.mutate()
    }, 60000)

    return () => clearInterval(interval)
  }, [user?.id])
}
