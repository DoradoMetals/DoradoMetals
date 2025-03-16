'use client';

import { useUserStore } from "@/store/useUserStore";

export function useAuthorization(requiredRoles: string[]) {
  const {user} = useUserStore()
  console.log(user)
  return requiredRoles.includes(user?.role);
}