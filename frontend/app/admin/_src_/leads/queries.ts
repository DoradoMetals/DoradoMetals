// Leads - the hooks now live in @dorado/client (one per endpoint, typed only
// from @dorado/contracts); this file re-exports them under the same names so
// LeadsAdminTable.tsx, LeadsDrawer.tsx and PrioritySelect.tsx need no changes.
// The legacy useApiQuery/useApiMutation wrapper (and its optimistic-update
// dance) is gone - @dorado/client owns the request, the query key and the
// cache update now.
export { useLeads, useCreateLead, useUpdateLead, useDeleteLead } from "@dorado/client";
