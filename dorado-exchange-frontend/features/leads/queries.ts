import { useApiMutation, useApiQuery } from "@/shared/queries/base";
import { queryKeys } from "@/shared/queries/keys";
import { Lead, NewLead } from "@/features/leads/types";

export const useLead = (leadId: string) =>
  useApiQuery<Lead[]>({
    key: queryKeys.adminLead(leadId),
    url: '/leads/get_one',
    requireAdmin: true,
    enabled: !!leadId,
    params: () => ({
      lead_id: leadId,
    }),
  })

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
  useApiMutation<Lead, { lead: Lead; user_name: string }, Lead[]>({
    queryKey: queryKeys.adminLeads(),
    url: '/leads/update',
    requireAdmin: true,
    optimisticItemKey: 'lead',
    body: ({ lead, user_name }) => ({
      user_name,
      lead,
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
