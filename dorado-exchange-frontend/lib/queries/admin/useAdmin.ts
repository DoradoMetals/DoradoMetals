import {
  AdminMetal,
  AdminMints,
  AdminProduct,
  AdminTypes,
  AdminUser,
  Carrier,
  Supplier,
} from '@/types/admin'
import { useApiMutation, useApiQuery } from '@/lib/base'
import { SpotPrice } from '@/types/metal'
import { queryKeys } from '@/lib/keyFactory'
import { Lead, NewLead } from '@/types/leads'

/* ------------------------   Products and Inventory   -------------------------------------- */

export const useAdminMetals = () =>
  useApiQuery<AdminMetal[]>({
    key: queryKeys.adminMetals(),
    url: '/admin/get_metals',
    method: 'GET',
    requireAdmin: true,
    params: (user) => ({
      user_id: user?.id,
    }),
  })

export const useAdminSuppliers = () =>
  useApiQuery<Supplier[]>({
    key: queryKeys.adminSuppliers(),
    url: '/suppliers/get_all',
    method: 'GET',
    requireAdmin: true,
    params: (user) => ({
      user_id: user?.id,
    }),
  })

export const useAdminCarriers = () =>
  useApiQuery<Carrier[]>({
    key: queryKeys.adminCarriers(),
    url: '/carriers/get_all',
    method: 'GET',
    requireUser: true,
    staleTime: 0,
    params: (user) => ({
      user_id: user?.id,
    }),
  })

export const useAdminMints = () =>
  useApiQuery<AdminMints[]>({
    key: queryKeys.adminMints(),
    url: '/admin/get_mints',
    method: 'GET',
    requireAdmin: true,
    params: (user) => ({
      user_id: user?.id,
    }),
  })

export const useAdminTypes = () =>
  useApiQuery<AdminTypes[]>({
    key: queryKeys.adminTypes(),
    url: '/admin/get_product_types',
    method: 'GET',
    requireAdmin: true,
    params: (user) => ({
      user_id: user?.id,
    }),
  })

export const useAdminProducts = () =>
  useApiQuery<AdminProduct[]>({
    key: queryKeys.adminProducts(),
    method: 'GET',
    url: '/admin/get_products',
    requireAdmin: true,
    staleTime: 30000,
    params: (user) => ({
      user_id: user?.id,
    }),
  })

export const useSaveProduct = () =>
  useApiMutation<void, AdminProduct, AdminProduct[]>({
    queryKey: queryKeys.adminProducts(),
    method: 'POST',
    url: '/admin/save_product',
    requireAdmin: true,
    listAction: 'upsert',
    body: (product, user) => ({
      product,
      user,
    }),
  })

export const useCreateProduct = () =>
  useApiMutation<AdminProduct, { name: string }, AdminProduct[]>({
    queryKey: queryKeys.adminProducts(),
    method: 'POST',
    url: '/admin/create_product',
    requireAdmin: true,
    listAction: 'create',
    listInsertPosition: 'start',
    body: ({ name }, user) => ({
      name,
      created_by: user?.name,
    }),
  })

export const useEditScrapPercentages = () =>
  useApiMutation<void, SpotPrice, SpotPrice[]>({
    method: 'POST',
    url: '/spots/update_scrap_percentage',
    requireAdmin: true,
    queryKey: queryKeys.spotPrices(),
    body: (spot, user) => ({
      user_id: user?.id,
      id: spot.id,
      scrap_percentage: spot.scrap_percentage,
    }),
  })

/* ------------------------   Users    -------------------------------------- */

export const useAdminUser = (user_id: string, options?: { enabled?: boolean }) =>
  useApiQuery<AdminUser>({
    key: queryKeys.adminUser(user_id),
    url: '/users/get_user',
    method: 'GET',
    requireAdmin: true,
    staleTime: 0,
    enabled: (sessionUser) => !!sessionUser && (options?.enabled ?? true),
    params: () => ({
      user_id,
    }),
  })

export const useAdminUsers = () =>
  useApiQuery<AdminUser[]>({
    key: queryKeys.adminAllUsers(),
    url: '/users/get_all_users',
    method: 'GET',
    requireAdmin: true,
    staleTime: 0,
    params: (user) => ({ user }),
  })

export const useAdminRoleUsers = () =>
  useApiQuery<AdminUser[]>({
    key: queryKeys.adminRoleUsers(),
    url: '/users/get_admin_users',
    method: 'GET',
    requireAdmin: true,
    staleTime: 0,
    params: (user) => ({ user }),
  })

export const useUpdateCredit = () =>
  useApiMutation<void, AdminUser, AdminUser[]>({
    method: 'POST',
    url: '/users/update_credit',
    requireAdmin: true,
    queryKey: queryKeys.adminAllUsers(),
    body: (user, _sessionUser) => ({
      user_id: user.id,
      mode: 'edit',
      amount: user.dorado_funds ?? 0,
    }),
  })

/* ------------------------   Leads    -------------------------------------- */

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
    optimistic: false,
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
