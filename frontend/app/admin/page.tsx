import { redirect } from 'next/navigation'

import { protectedRoutes } from '@/shared/types/routes'

export default function Page() {
  redirect(protectedRoutes.adminPricingSpots.path)
}
