'use client'

import { Suspense } from 'react'
import ResetPasswordForm from '@/features/auth/ui/ResetPasswordForm'

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <div className="mt-12 lg:mt-32 ">
        <ResetPasswordForm />
      </div>
    </Suspense>
  )
}
