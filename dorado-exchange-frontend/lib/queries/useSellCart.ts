import { useMutation, useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { sellCartStore } from '@/store/sellCartStore'
import { useEffect } from 'react'
import { useGetSession } from './useAuth'

export const useSyncSellCartToBackend = () => {
  const { user } = useGetSession()

  return useMutation({
    mutationFn: async () => {
      const items = sellCartStore.getState().items

      if (!user?.id) {
        throw new Error('Missing user')
      }

      return await apiRequest('POST', '/sell_cart/sync_sell_cart', {
        user_id: user.id,
        cart: items,
      })
    },
  })
}

export const useSellCartAutoSync = () => {
  const { user } = useGetSession()
  const syncMutation = useSyncSellCartToBackend()

  useEffect(() => {
    if (!user?.id) return
    const interval = setInterval(() => {
      syncMutation.mutate()
    }, 15000)

    return () => clearInterval(interval)
  }, [user?.id])
}
