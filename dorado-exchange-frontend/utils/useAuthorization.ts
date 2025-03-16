'use client';
import { useUserStore } from "@/store/useUserStore";

export function useAuthorization(requiredRoles: string[]) {
  const {user, userPending} = useUserStore()

  if (userPending) {
    return { authorized: false, loading: true };
  } 
  
  if (!user) {
    return { authorized: false, loading: false };
  }

  return { authorized: requiredRoles.includes(user?.role), loading: false };
}