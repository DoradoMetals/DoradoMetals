import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from '../useAuth'
import { AdminMetal, AdminMints, AdminSuppliers, AdminTypes } from '@/types/admin'

export const useAdminMetals = () => {
  const { user } = useGetSession()
  return useQuery<AdminMetal[]>({
    queryKey: ['adminMetals'],
    queryFn: async () => {
      return await apiRequest<AdminMetal[]>('GET', '/admin/get_metals', undefined, {user_id: user?.id})
    },
    staleTime: 0,
    enabled: !!user,
  })
}

export const useAdminSuppliers = () => {
  const { user } = useGetSession()
  return useQuery<AdminSuppliers[]>({
    queryKey: ['adminSuppliers'],
    queryFn: async () => {
      return await apiRequest<AdminSuppliers[]>('GET', '/admin/get_suppliers', undefined, {user_id: user?.id})
    },
    staleTime: 0,
    enabled: !!user,
  })
}

export const useAdminMints = () => {
  const { user } = useGetSession()
  return useQuery<AdminMints[]>({
    queryKey: ['adminMints'],
    queryFn: async () => {
      return await apiRequest<AdminMints[]>('GET', '/admin/get_mints', undefined, {user_id: user?.id})
    },
    staleTime: 0,
    enabled: !!user,
  })
}

export const useAdminTypes = () => {
  const { user } = useGetSession()
  return useQuery<AdminTypes[]>({
    queryKey: ['adminTypes'],
    queryFn: async () => {
      return await apiRequest<AdminTypes[]>('GET', '/admin/get_product_types', undefined, {user_id: user?.id})
    },
    staleTime: 0,
    enabled: !!user,
  })
}



