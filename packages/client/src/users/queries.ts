"use client";

// PEOPLE AND THEIR CREDIT. The three admin reads, the one admin write, and the
// caller's own ledger.
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

// THE OPERATION, NOT THE RESULT (ruling 10, D98).
//
// The SUBJECT is the path's now (ruling 43); the body is the operation alone.
//
// This used to send `amount: user.dorado_funds` - the balance the BROWSER had
// computed - and the server stored it verbatim. Two problems on a ledger
// holding $66,999.32 across eight customers: the client was doing the
// arithmetic, and two admins with the drawer open both read the same starting
// balance, so the second write silently discarded the first. `{op, amount}`
// lets the server apply a DELTA under a row lock, where the outcome does not
// depend on what a browser last saw - and the row it answers with is the
// balance, so nothing has to be recomputed here either.
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

// GET /api/transactions - the CALLER'S OWN credit ledger, newest first. The
// subject is the session's; there is no id to pass and passing one changes
// nothing (it used to change everything - see the API controller's own
// note).
export function useCreditLedger(options: { enabled?: boolean } = {}) {
  return useQuery<AccountTransaction[]>({
    queryKey: keys.users.ledger(),
    enabled: options.enabled ?? true,
    queryFn: () =>
      apiRequest<AccountTransaction[]>("GET", "/transactions"),
  });
}
