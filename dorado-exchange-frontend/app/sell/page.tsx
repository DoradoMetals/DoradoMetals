'use client'

import { SellTabs } from '@/components/custom/sell/sellTabs'
import { Suspense } from 'react'

export default function Page() {
  return (
    <div className="flex flex-col items-center gap-4">
      <Suspense fallback={<p>Loading...</p>}>
        <SellTabs />
      </Suspense>
    </div>
  )
}
