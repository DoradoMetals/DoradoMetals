'use client';

import ProtectedPage from '@/components/custom/auth/protectedPage'
import { protectedRoutes } from '@/types/routes'
import { UserTabs } from '@/components/custom/user-tabs/user-tabs'

export default function Page() {
  return (
    <ProtectedPage requiredRoles={protectedRoutes.account.roles}>
      <div className="flex flex-col items-center gap-3">
        <UserTabs />
      </div>
    </ProtectedPage>
  )
}
