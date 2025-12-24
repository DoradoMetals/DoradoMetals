'use client';

import ProtectedPage from '@/features/auth/hooks/useProtectedPage'
import CheckoutStepper from '@/features/checkout/purchase-order-checkout/checkoutStepper'
import { protectedRoutes } from '@/features/routes/types'

export default function Page() {
  return (
    <ProtectedPage requiredRoles={protectedRoutes.checkout.roles}>
      <div className="flex flex-col h-full items-center gap-4">
        <CheckoutStepper />
      </div>
    </ProtectedPage>
  )
}
