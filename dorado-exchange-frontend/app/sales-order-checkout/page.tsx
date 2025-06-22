'use client';

import ProtectedPage from '@/components/custom/auth/protectedPage'
import SalesOrderCheckout from '@/components/custom/sales-order-checkout/salesOrderCheckout'
import { protectedRoutes } from '@/types/routes'

export default function Page() {
  return (
    <ProtectedPage requiredRoles={protectedRoutes.salesOrderCheckout.roles}>
      <div className="flex flex-col h-full items-center gap-4">
        <SalesOrderCheckout />
      </div>
    </ProtectedPage>
  )
}
