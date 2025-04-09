import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from '../useAuth'
import { AdminProduct } from '@/types/admin'

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
      console.log('error saving product')
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
      if (!user?.name) throw new Error("User name is required to create product.")
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
      console.log('new product: ', newProduct)

      queryClient.setQueryData<AdminProduct[]>(['adminProducts'], (old): AdminProduct[] => [
        newProduct,
        ...(old ?? []),
      ])
    },

    onError: (_err, _vars, context) => {
      console.log('Error creating product')
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
      console.log('error deleting product')
      if (context?.previousProducts) {
        queryClient.setQueryData(['adminProducts'], context.previousProducts)
      }
    },
  })
}
