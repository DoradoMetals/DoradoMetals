"use client";

// THE TWO AUTH-ADJACENT CALLS THAT ARE OURS.
//
// Everything else the auth surface does goes through better-auth's own client
// (`frontend/features/auth/authClient.ts`), which owns its transport and is not
// this package's business. These two are OUR endpoints, and they were the last
// two `apiRequest` calls under `frontend/` outside the legacy transport - which
// is what kept `frontend/features/auth` on lint:client-boundary's PENDING list.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "../fetch";

// Sets a password for the currently-authenticated user - the magic-link welcome
// flow. Admin-created and order-created accounts start passwordless, and
// better-auth's setPassword rejects a user who already has one, so this works
// exactly once per account.
export function useSetPassword() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (newPassword: string) =>
      apiRequest<{ success: boolean }>("POST", "/account/set_password", { newPassword }),
    onSettled: () => {
      client.invalidateQueries({ queryKey: ["session"], refetchType: "active" });
    },
  });
}

// The v3 token, scored server-side. The browser never learns the threshold and
// never sees the secret.
export function useVerifyRecaptcha() {
  return useMutation({
    mutationFn: (token: string) =>
      apiRequest<boolean>("POST", "/recaptcha/verify-recaptcha", { token }),
  });
}
