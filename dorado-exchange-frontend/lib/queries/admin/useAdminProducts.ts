import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from '../useAuth'
import { AdminProduct, ProductFormSchema } from '@/types/admin'

export const useAdminProducts = () => {
  const { user } = useGetSession()
  return useQuery<AdminProduct[]>({
    queryKey: ['adminProducts'],
    queryFn: async () => {
      return await apiRequest<AdminProduct[]>('GET', '/admin/get_products', undefined, {user_id: user?.id})
    },
    staleTime: 0,
    enabled: !!user,
  })
}

export const useSaveProduct = () => {
  const queryClient = useQueryClient()
  const { user } = useGetSession()

  return useMutation({
    mutationFn: async (product: ProductFormSchema) => {
      return await apiRequest('POST', '/admin/save_product', {
        product,
        user_id: user?.id,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminProducts'], refetchType: 'active' })
    },
  })
}

export const useDeleteProduct = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (product_id: string) => {
      return await apiRequest('POST', '/admin/delete_product', {
        product_id,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminProducts'], refetchType: 'active' })
    },
  })
}
