'use client';

import { useUserStore } from "@/store/userStore";

export function useAuthorization(requiredRoles: string[]) {
  const {user} = useUserStore()
  return requiredRoles.includes(user?.role);
}