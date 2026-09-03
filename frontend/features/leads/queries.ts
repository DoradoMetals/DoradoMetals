import { upsertById, useApiMutation, useApiQuery } from "@/shared/queries/base";
import { queryKeys } from "@/shared/queries/keys";
import { Lead, LeadPatch, NewLead } from "@/features/leads/types";

export const useLeads = () =>
  useApiQuery<Lead[]>({
    key: queryKeys.adminLeads(),
    url: '/leads/get_all',
    requireAdmin: true,
    requireUser: true,
  })

export const useCreateLead = () =>
  useApiMutation<Lead, NewLead, Lead[]>({
    queryKey: queryKeys.adminLeads(),
    url: '/leads/create',
    requireAdmin: true,
    listAction: 'create',
    listInsertPosition: 'start',
    body: (lead) => ({
      lead,
    }),
  })

export const useUpdateLead = () =>
  useApiMutation<Lead, { lead_id: string; patch: LeadPatch; user_name: string }, Lead[]>({
    queryKey: queryKeys.adminLeads(),
    url: '/leads/update',
    requireAdmin: true,
    optimisticUpdater: (previous, vars) => {
      const current = previous?.find((l) => l.id === vars.lead_id)
      return upsertById(previous, { ...current, ...vars.patch, id: vars.lead_id } as Lead)
    },
    body: ({ lead_id, patch, user_name }) => ({
      lead_id,
      patch,
      user_name,
    }),
  })

export const useDeleteLead = () =>
  useApiMutation<void, Lead, Lead[]>({
    queryKey: queryKeys.adminLeads(),
    method: 'DELETE',
    url: '/leads/delete',
    requireAdmin: true,
    listAction: 'delete',
    optimisticItemKey: 'id',
    body: (lead) => ({
      lead_id: lead.id,
    }),
  })
