'use client'

import { SignInAndUpTabs } from '@/features/auth/ui/SignInAndUpTabs'
import { Suspense } from 'react'

export default function Page() {
  return (
    <div className="flex flex-col items-center">
      <Suspense fallback={<p>Loading...</p>}>
        <SignInAndUpTabs />
      </Suspense>
    </div>
  )
}
