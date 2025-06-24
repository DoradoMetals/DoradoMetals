'use client'

import ProtectedPage from '@/components/custom/auth/protectedPage'
import { protectedRoutes } from '@/types/routes'
import ChangePasswordForm from '@/components/custom/auth/changePassword'

export default function Page() {
  return (
    <ProtectedPage requiredRoles={protectedRoutes.changePassword.roles}>
      <div className="mt-12 lg:mt-32 ">
        <ChangePasswordForm />
      </div>
    </ProtectedPage>
  )
}
