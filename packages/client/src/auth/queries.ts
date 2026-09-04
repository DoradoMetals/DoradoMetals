"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "../fetch";

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

export function useVerifyRecaptcha() {
  return useMutation({
    mutationFn: (token: string) =>
      apiRequest<boolean>("POST", "/recaptcha/verify-recaptcha", { token }),
  });
}
