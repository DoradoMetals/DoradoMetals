'use client'

import { useRouter } from 'next/navigation'
import { AdminHeader, Chip } from '@dorado/components'

import { protectedRoutes } from '@/shared/types/routes'

export default function Page() {
  const router = useRouter()

  return (
    <AdminHeader
      title="Admin"
      chips={
        <>
          <Chip label="Orders" disabled />
          <Chip label="Inventory" disabled />
          <Chip label="People" disabled />
          <Chip label="Pricing" onClick={() => router.push(protectedRoutes.adminPricing.path)} />
        </>
      }
    />
  )
}
