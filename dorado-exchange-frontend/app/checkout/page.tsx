'use client';

import ProtectedPage from '@/components/custom/auth/protectedPage'
import CheckoutStepper from '@/components/custom/purchase-order-checkout/checkoutStepper'
import { protectedRoutes } from '@/types/routes'

export default function Page() {
  return (
    <ProtectedPage requiredRoles={protectedRoutes.checkout.roles}>
      <div className="flex flex-col h-full items-center gap-4">
        <CheckoutStepper />
      </div>
    </ProtectedPage>
  )
}
