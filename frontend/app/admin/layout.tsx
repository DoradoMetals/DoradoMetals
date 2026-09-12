'use client'

import ProtectedPage from '@/shared/hooks/useProtectedPage'
import { protectedRoutes } from '@/shared/types/routes'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedPage requiredRoles={protectedRoutes.admin.roles}>{children}</ProtectedPage>
}
