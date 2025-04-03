import { useMutation, useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useUserStore } from '@/store/userStore'
import { Product } from '@/types/product'
import { cartStore } from '@/store/cartStore'
import { useEffect } from 'react'

export const useHydrateCartFromBackend = () => {
  const { user } = useUserStore()
  
  const mergeCartItems = cartStore((state) => state.mergeCartItems)

  const query = useQuery<Product[], Error>({
    queryKey: ['cart', user?.id],
    queryFn: async () => {
      return await apiRequest<Product[]>('GET', '/cart/get_cart', undefined, { user_id: user.id })
    },
    enabled: !!user?.id,
  })

  useEffect(() => {
    if (query.data) {
      mergeCartItems(query.data)
    }
  }, [query.data, mergeCartItems])

  return query
}

export const useSyncCartToBackend = () => {
  const { user } = useUserStore()

  return useMutation({
    mutationFn: async () => {
      const items = cartStore.getState().items

      if (!user?.id) {
        throw new Error('Missing user')
      }

      return await apiRequest('POST', '/cart/sync_cart', {
        user_id: user.id,
        cart: items,
      })
    },
  })
}

export const useCartAutoSync = () => {
  const { user } = useUserStore()
  const syncCartMutation = useSyncCartToBackend()

  useEffect(() => {
    if (!user?.id) return
    const interval = setInterval(() => {
      syncCartMutation.mutate()
    }, 60000)

    return () => clearInterval(interval)
  }, [user?.id])
}