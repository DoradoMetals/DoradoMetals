'use client'

import ProtectedPage from '@/shared/hooks/useProtectedPage'
import CheckoutStepper from './_src_/checkoutStepper'
import { protectedRoutes } from '@/shared/types/routes'

export default function Page() {
  return (
    <ProtectedPage requiredRoles={protectedRoutes.checkout.roles}>
      <CheckoutStepper />
    </ProtectedPage>
  )
}
