"use client";

// THE LEADS SURFACE. Sales contacts, admin-only throughout - see
// api/transport/leads/routes.ts for why (a lead belongs to the business,
// not a customer, so there is no non-admin read to gate here at all).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Lead, LeadPatch } from "@dorado/contracts";

import { apiRequest } from "../fetch";
import { keys } from "../keys";

// GET /api/leads
export function useLeads() {
  return useQuery<Lead[]>({
    queryKey: keys.leads.all(),
    queryFn: () => apiRequest<Lead[]>("GET", "/leads"),
  });
}

// POST /api/leads -> 201. Prepended to the cached list from the row the
// server actually wrote (real id included) rather than invalidating and
// refetching the whole list - the create still lands on screen in one round
// trip instead of two.
export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lead: LeadPatch) => apiRequest<Lead>("POST", "/leads", lead),
    onSuccess: (created) => {
      queryClient.setQueryData<Lead[]>(keys.leads.all(), (previous) =>
        previous ? [created, ...previous] : [created]
      );
    },
  });
}

// PATCH /api/leads/:id
export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lead_id, patch }: { lead_id: string; patch: LeadPatch }) =>
      apiRequest<Lead>("PATCH", `/leads/${lead_id}`, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData<Lead[]>(keys.leads.all(), (previous) =>
        previous?.map((l) => (l.id === updated.id ? updated : l))
      );
    },
  });
}

// DELETE /api/leads/:id. Removed from the cached list the moment the
// request is sent (onMutate), not after the round trip - restored if it
// fails, which is what "delete feels instant" actually bought under the old
// optimistic-mutation wrapper.
export function useDeleteLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lead: Lead) => apiRequest<void>("DELETE", `/leads/${lead.id}`),
    onMutate: async (lead) => {
      await queryClient.cancelQueries({ queryKey: keys.leads.all() });
      const previous = queryClient.getQueryData<Lead[]>(keys.leads.all());
      queryClient.setQueryData<Lead[]>(keys.leads.all(), (list) =>
        list?.filter((l) => l.id !== lead.id)
      );
      return { previous };
    },
    onError: (_err, _lead, context) => {
      if (context?.previous) queryClient.setQueryData(keys.leads.all(), context.previous);
    },
  });
}
