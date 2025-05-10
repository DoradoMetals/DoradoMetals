import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from '../useAuth'
import { AdminProduct, AdminProductsInventory } from '@/types/admin'

export const useAdminProducts = () => {
  const { user } = useGetSession()
  return useQuery<AdminProduct[]>({
    queryKey: ['adminProducts'],
    queryFn: async () => {
      return await apiRequest<AdminProduct[]>('GET', '/admin/get_products', undefined, {
        user_id: user?.id,
      })
    },
    staleTime: 0,
    enabled: !!user,
  })
}

export const useSaveProduct = () => {
  const queryClient = useQueryClient()
  const { user } = useGetSession()

  return useMutation({
    mutationFn: async (product: AdminProduct) => {
      return await apiRequest('POST', '/admin/save_product', {
        product,
        user,
      })
    },

    onMutate: async (updatedProduct) => {
      await queryClient.cancelQueries({ queryKey: ['adminProducts'] })

      const previousProducts = queryClient.getQueryData<AdminProduct[]>(['adminProducts'])

      queryClient.setQueryData<AdminProduct[]>(['adminProducts'], (old = []) =>
        old.map((p) => (p.id === updatedProduct.id ? { ...p, ...updatedProduct } : p))
      )

      return { previousProducts }
    },

    onError: (_err, _newProduct, context) => {
      if (context?.previousProducts) {
        queryClient.setQueryData(['adminProducts'], context.previousProducts)
      }
    },
  })
}

export const useCreateProduct = () => {
  const queryClient = useQueryClient()
  const { user } = useGetSession()

  return useMutation({
    mutationFn: async (): Promise<AdminProduct> => {
      if (!user?.name) throw new Error('User name is required to create product.')
      return await apiRequest<AdminProduct>('POST', '/admin/create_product', {
        created_by: user.name,
      })
    },

    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['adminProducts'] })

      const previousProducts = queryClient.getQueryData<AdminProduct[]>(['adminProducts'])

      return { previousProducts }
    },

    onSuccess: (newProduct) => {
      queryClient.setQueryData<AdminProduct[]>(['adminProducts'], (old): AdminProduct[] => [
        newProduct,
        ...(old ?? []),
      ])
    },

    onError: (_err, _vars, context) => {
      if (context?.previousProducts) {
        queryClient.setQueryData(['adminProducts'], context.previousProducts)
      }
    },
  })
}

export const useDeleteProduct = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (product: AdminProduct) => {
      return await apiRequest('POST', '/admin/delete_product', {
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

export const useGetInventory = () => {
  const { user } = useGetSession()
  return useQuery<AdminProductsInventory>({
    queryKey: ['productInventory'],
    queryFn: async () => {
      return await apiRequest<AdminProductsInventory>('GET', '/admin/get_inventory', undefined, {
        user_id: user?.id,
      })
    },
    staleTime: 0,
    enabled: !!user,
  })
}
