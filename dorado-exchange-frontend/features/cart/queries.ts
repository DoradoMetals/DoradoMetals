import { useMutation } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { cartStore } from '@/shared/store/cartStore'
import { useEffect } from 'react'
import { useGetSession } from '../auth/queries'
import { sellCartStore } from '@/shared/store/sellCartStore'

export const useSyncCartToBackend = () => {
  const { user } = useGetSession()

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

export const useSyncSellCartToBackend = () => {
   const { user } = useGetSession();

  return useMutation({
    mutationFn: async () => {
      const items = sellCartStore.getState().items

      if (!user?.id) {
        throw new Error('Missing user')
      }

      return await apiRequest('POST', '/cart/sync_sell_cart', {
        user_id: user.id,
        cart: items,
      })
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

