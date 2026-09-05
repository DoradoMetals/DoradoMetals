'use client'

import ProtectedPage from '@/shared/hooks/useProtectedPage'
import { protectedRoutes } from '@/shared/types/routes'
import ChangePasswordForm from '@/shared/ui/ChangePasswordForm'

export default function Page() {
  return (
    <ProtectedPage requiredRoles={protectedRoutes.changePassword.roles}>
      <ChangePasswordForm />
    </ProtectedPage>
  )
}
