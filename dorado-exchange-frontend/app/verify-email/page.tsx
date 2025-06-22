'use client';

import ProtectedPage from '@/components/custom/auth/protectedPage'
import VerifyEmail from '@/components/custom/auth/verifyEmail'
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
