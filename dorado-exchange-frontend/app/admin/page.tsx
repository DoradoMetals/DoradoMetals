'use client'

import { AdminTabs } from '@/components/custom/admin/adminTabs'
import ProtectedPage from '@/components/custom/auth/protectedPage'
import { protectedRoutes } from '@/types/routes'
import { Suspense } from 'react'

export default function Page() {
  return (
    <ProtectedPage requiredRoles={protectedRoutes.admin.roles}>
      <div className="flex flex-col items-center px-5">
        <Suspense fallback={<p>Loading...</p>}>
          <AdminTabs />
        </Suspense>
      </div>
    </ProtectedPage>
  )
}
