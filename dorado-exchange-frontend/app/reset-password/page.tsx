'use client';

import { Suspense } from 'react'
import ResetPasswordForm from '@/components/custom/auth/resetPasswordForm'
import ProtectedPage from '@/components/custom/auth/protectedPage'
import { protectedRoutes } from '@/types/routes'

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <ProtectedPage requiredRoles={protectedRoutes.resetPassword.roles}>
        <div className="h-screen mt-12 lg:mt-32 ">
          <ResetPasswordForm />
        </div>
      </ProtectedPage>
    </Suspense>
  )
}
