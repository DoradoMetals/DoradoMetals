'use client'

import ProtectedPage from '@/shared/hooks/useProtectedPage'
import { protectedRoutes } from '@/shared/types/routes'

// The whole admin area is admin-only, and the gate is the session's own role -
// one hook, one answer, no per-page check.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedPage requiredRoles={protectedRoutes.adminOrder.roles}>{children}</ProtectedPage>
  )
}
