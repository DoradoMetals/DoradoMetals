import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from '../useAuth'
import { AdminProduct, AdminScrap } from '@/types/admin'

export const useAdminScrap = () => {
  const { user } = useGetSession()
  return useQuery<AdminScrap[]>({
    queryKey: ['adminScrap'],
    queryFn: async () => {
      return await apiRequest<AdminScrap[]>('GET', '/admin/get_scrap', undefined, {user_id: user?.id})
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
      console.log('error saving scrap')
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
      console.log('error deleting product')
      if (context?.previousProducts) {
        queryClient.setQueryData(['adminProducts'], context.previousProducts)
      }
    },
  })
}
