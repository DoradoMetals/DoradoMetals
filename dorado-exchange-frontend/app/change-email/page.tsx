'use client';

import { Suspense } from 'react'
import ChangeEmail from '@/components/custom/auth/changeEmail'
import ProtectedPage from '@/components/custom/auth/protectedPage'
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
