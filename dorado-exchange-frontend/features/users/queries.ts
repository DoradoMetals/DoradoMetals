import { AdminUser } from "@/features/users/types"
import { useApiMutation, useApiQuery } from "@/shared/queries/base"
import { queryKeys } from "@/shared/queries/keys"

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