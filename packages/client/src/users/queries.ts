"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccountTransaction, AdminUser, UpdateCreditBody } from "@dorado/contracts";

import { apiRequest } from "../fetch";
import { keys } from "../keys";

export function useAdminUser(user_id: string, options: { enabled?: boolean } = {}) {
  return useQuery<AdminUser>({
    queryKey: keys.users.one(user_id),
    enabled: (options.enabled ?? true) && !!user_id,
    staleTime: 0,
    queryFn: () => apiRequest<AdminUser>("GET", `/users/${user_id}`),
  });
}

export function useAdminUsers(options: { enabled?: boolean } = {}) {
  return useQuery<AdminUser[]>({
    queryKey: keys.users.all(),
    enabled: options.enabled ?? true,
    staleTime: 0,
    queryFn: () => apiRequest<AdminUser[]>("GET", "/users"),
  });
}

export function useAdminRoleUsers(options: { enabled?: boolean } = {}) {
  return useQuery<AdminUser[]>({
    queryKey: keys.users.admins(),
    enabled: options.enabled ?? true,
    staleTime: 0,
    queryFn: () => apiRequest<AdminUser[]>("GET", "/users/admins"),
  });
}

export function useUpdateCredit() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ user_id, body }: { user_id: string; body: UpdateCreditBody }) =>
      apiRequest<{ id: string; dorado_funds: number | null }>(
        "POST", `/users/${user_id}/credit`, body
      ),
    onSettled: (_row, _err, { user_id }) => {
      client.invalidateQueries({ queryKey: keys.users.all() });
      client.invalidateQueries({ queryKey: keys.users.one(user_id) });
      client.invalidateQueries({ queryKey: keys.users.ledger() });
    },
  });
}

export function useCreditLedger(options: { enabled?: boolean } = {}) {
  return useQuery<AccountTransaction[]>({
    queryKey: keys.users.ledger(),
    enabled: options.enabled ?? true,
    queryFn: () =>
      apiRequest<AccountTransaction[]>("GET", "/transactions"),
  });
}
