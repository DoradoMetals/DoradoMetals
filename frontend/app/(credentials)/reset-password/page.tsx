'use client'

import { Suspense } from 'react'
import ResetPasswordForm from './_src_/ui/ResetPasswordForm'

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <ResetPasswordForm />
    </Suspense>
  )
}
