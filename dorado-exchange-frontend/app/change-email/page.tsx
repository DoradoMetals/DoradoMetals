'use client';

import { Suspense } from 'react'
import ChangeEmail from '@/features/auth/ui/ChangeEmailSucess'
import ProtectedPage from '@/features/auth/hooks/useProtectedPage'
import { protectedRoutes } from '@/types/routes'

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <ProtectedPage requiredRoles={protectedRoutes.changeEmail.roles}>
        <ChangeEmail />
      </ProtectedPage>
    </Suspense>
  )
}
