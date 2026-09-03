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

// THE OPERATION, NOT THE RESULT (ruling 10, D98).
//
// This used to send `amount: user.dorado_funds` - the balance the BROWSER had
// computed - and the server stored it verbatim. Two problems on a ledger
// holding $66,999.32 across eight customers: the client was doing the
// arithmetic, and two admins with the drawer open both read the same starting
// balance and the second write silently discarded the first. Sending {op,
// amount} lets the server apply a DELTA inside a transaction, where the row is
// locked and the outcome does not depend on what the browser last saw.
export const useUpdateCredit = () =>
  useApiMutation<
    { id: string; dorado_funds: number | null },
    { user_id: string; op: 'add' | 'subtract' | 'edit'; amount: number },
    AdminUser[]
  >({
    method: 'POST',
    url: '/users/update_credit',
    requireAdmin: true,
    queryKey: queryKeys.adminAllUsers(),
    body: (input) => input,
  })