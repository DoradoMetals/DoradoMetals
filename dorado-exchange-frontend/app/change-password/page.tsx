'use client'

import ProtectedPage from '@/features/auth/hooks/useProtectedPage'
import { protectedRoutes } from '@/types/routes'
import ChangePasswordForm from '@/features/auth/ui/ChangePasswordForm'

export default function Page() {
  return (
    <ProtectedPage requiredRoles={protectedRoutes.changePassword.roles}>
      <div className="mt-12 lg:mt-32 ">
        <ChangePasswordForm />
      </div>
    </ProtectedPage>
  )
}
