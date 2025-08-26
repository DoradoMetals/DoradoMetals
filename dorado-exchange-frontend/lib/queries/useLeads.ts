import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from './useAuth'
import { Lead, NewLead } from '@/types/leads'

export const useLead = (lead_id: string) => {
  return useQuery<Lead[]>({
    queryKey: ['lead', lead_id],
    queryFn: async () => {
      return await apiRequest<Lead[]>('GET', '/leads/get_one', undefined, {
        lead_id: lead_id,
      })
    },
    enabled: !!lead_id,
  })
}

export const useLeads = () => {
  const { user } = useGetSession()

  return useQuery<Lead[]>({
    queryKey: ['leads', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      return await apiRequest<Lead[]>('GET', '/leads/get_all', undefined, {})
    },
    enabled: !!user,
  })
}

export const useCreateLead = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (lead: NewLead) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<Lead>('POST', '/leads/create', {
        lead,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', user?.id], refetchType: 'active' })
    },
  })
}

export const useUpdateLead = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ lead, user_name }: { lead: Lead; user_name: string }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<Lead>('POST', '/leads/update', {
        user_name,
        lead,
      })
    },
    onMutate: async (updated) => {
      await queryClient.cancelQueries({ queryKey: ['leads', user?.id] })

      const previous = queryClient.getQueryData<Lead[]>(['leads', user?.id])

      queryClient.setQueryData<Lead[]>(['leads', user?.id], (old = []) =>
        old.map((lead) => (lead.id === updated?.lead.id ? { ...lead, ...updated.lead } : lead))
      )

      return { previous }
    },
    onError: (_err, _newProduct, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['leads', user?.id], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', user?.id], refetchType: 'active' })
    },
  })
}

export const useDeleteLead = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (lead: Lead) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest('DELETE', '/leads/delete', {
        lead_id: lead.id,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', user?.id], refetchType: 'active' })
    },
  })
}
