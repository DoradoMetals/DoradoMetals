'use client';

import ProtectedPage from '@/features/auth/hooks/useProtectedPage'
import VerifyEmail from '@/features/auth/ui/VerifyEmail'
import { protectedRoutes } from '@/types/routes'
import { Suspense } from 'react'

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <ProtectedPage requiredRoles={protectedRoutes.verifyEmail.roles}>
        <VerifyEmail />
      </ProtectedPage>
    </Suspense>
  )
}
