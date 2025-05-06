import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from '../useAuth'
import { AdminProduct, AdminScrap } from '@/types/admin'
import { SpotPrice } from '@/types/metal'

export const useAdminScrap = () => {
  const { user } = useGetSession()
  return useQuery<AdminScrap[]>({
    queryKey: ['adminScrap'],
    queryFn: async () => {
      return await apiRequest<AdminScrap[]>('GET', '/admin/get_scrap', undefined, {
        user_id: user?.id,
      })
    },
    staleTime: 0,
    enabled: !!user,
  })
}

export const useSaveScrap = () => {
  const queryClient = useQueryClient()
  const { user } = useGetSession()

  return useMutation({
    mutationFn: async (product: AdminProduct) => {
      return await apiRequest('POST', '/admin/save_product', {
        product,
        user,
      })
    },

    onMutate: async (updatedScrap) => {
      await queryClient.cancelQueries({ queryKey: ['adminScrap'] })

      const previousScrap = queryClient.getQueryData<AdminProduct[]>(['adminScrap'])

      queryClient.setQueryData<AdminProduct[]>(['adminScrap'], (old = []) =>
        old.map((s) => (s.id === updatedScrap.id ? { ...s, ...updatedScrap } : s))
      )

      return { previousScrap }
    },

    onError: (_err, _newScrap, context) => {
      if (context?.previousScrap) {
        queryClient.setQueryData(['adminProducts'], context.previousScrap)
      }
    },
  })
}

export const useDeleteScrap = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (product: AdminProduct) => {
      return await apiRequest('POST', '/admin/delete_scrap', {
        product,
      })
    },

    onMutate: async (deletedProduct) => {
      await queryClient.cancelQueries({ queryKey: ['adminProducts'] })

      const previousProducts = queryClient.getQueryData<AdminProduct[]>(['adminProducts'])

      queryClient.setQueryData<AdminProduct[]>(['adminProducts'], (old = []) =>
        old.filter((p) => p.id !== deletedProduct.id)
      )

      return { previousProducts }
    },

    onError: (_err, _deletedProduct, context) => {
      if (context?.previousProducts) {
        queryClient.setQueryData(['adminProducts'], context.previousProducts)
      }
    },
  })
}

export const useEditScrapPercentages = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, scrap_percentage }: { id: string; scrap_percentage: number }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<{ id: string; scrap_percentage: number }>(
        'POST',
        '/spots/update_scrap_percentage',
        {
          user_id: user.id,
          id,
          scrap_percentage,
        }
      )
    },
    onMutate: async (updatedSpot) => {
      await queryClient.cancelQueries({ queryKey: ['spot_prices'] })

      const previousSpotPrices = queryClient.getQueryData<SpotPrice[]>(['spot_prices'])

      queryClient.setQueryData<SpotPrice[]>(['spot_prices'], (old = []) =>
        old.map((spot) =>
          spot.id === updatedSpot.id
            ? { ...spot, scrap_percentage: updatedSpot.scrap_percentage }
            : spot
        )
      )
      return { previousSpotPrices }
    },
    onError: (_err, _newSpot, context) => {
      if (context?.previousSpotPrices) {
        queryClient.setQueryData(['spot_prices'], context.previousSpotPrices)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['spot_prices'], refetchType: 'active' })
    },
  })
}
