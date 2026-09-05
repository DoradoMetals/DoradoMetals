'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Lead, LeadPatch } from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

export function useLeads() {
  return useQuery<Lead[]>({
    queryKey: keys.leads.all(),
    queryFn: () => apiRequest<Lead[]>('GET', '/leads'),
  })
}

export function useCreateLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (lead: LeadPatch) => apiRequest<Lead>('POST', '/leads', lead),
    onSuccess: (created) => {
      queryClient.setQueryData<Lead[]>(keys.leads.all(), (previous) =>
        previous ? [created, ...previous] : [created]
      )
    },
  })
}

export function useUpdateLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ lead_id, patch }: { lead_id: string; patch: LeadPatch }) =>
      apiRequest<Lead>('PATCH', `/leads/${lead_id}`, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData<Lead[]>(keys.leads.all(), (previous) =>
        previous?.map((l) => (l.id === updated.id ? updated : l))
      )
    },
  })
}

export function useDeleteLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (lead: Lead) => apiRequest<void>('DELETE', `/leads/${lead.id}`),
    onMutate: async (lead) => {
      await queryClient.cancelQueries({ queryKey: keys.leads.all() })
      const previous = queryClient.getQueryData<Lead[]>(keys.leads.all())
      queryClient.setQueryData<Lead[]>(keys.leads.all(), (list) =>
        list?.filter((l) => l.id !== lead.id)
      )
      return { previous }
    },
    onError: (_err, _lead, context) => {
      if (context?.previous) queryClient.setQueryData(keys.leads.all(), context.previous)
    },
  })
}
