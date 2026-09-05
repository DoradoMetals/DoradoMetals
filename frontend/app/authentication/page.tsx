'use client'

import { SignInAndUpTabs } from './_src_/ui/SignInAndUpTabs'
import { Suspense } from 'react'

export default function Page() {
  return (
    <main className="flex flex-col items-center">
      <Suspense fallback={<p>Loading...</p>}>
        <SignInAndUpTabs />
      </Suspense>
    </main>
  )
}
