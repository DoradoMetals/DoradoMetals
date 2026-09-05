'use client'

import ProtectedPage from '@/shared/hooks/useProtectedPage'
import SalesOrderCheckout from './_src_/salesOrderCheckout'
import { protectedRoutes } from '@/shared/types/routes'

export default function Page() {
  return (
    <ProtectedPage requiredRoles={protectedRoutes.salesOrderCheckout.roles}>
      <SalesOrderCheckout />
    </ProtectedPage>
  )
}
