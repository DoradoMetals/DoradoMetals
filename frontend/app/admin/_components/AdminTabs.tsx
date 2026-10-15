'use client'

import { useRouter } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger } from '@dorado/components'

import { protectedRoutes } from '@/shared/types/routes'

export type AdminTab = 'orders' | 'pricing'

export function AdminTabs({ active }: { active: AdminTab }) {
  const router = useRouter()
  return (
    <Tabs value={active}>
      <TabsList aria-label="Admin">
        <TabsTrigger value="orders" onClick={() => router.push(protectedRoutes.adminOrders.path)}>
          Orders
        </TabsTrigger>
        <TabsTrigger value="inventory" disabled>
          Inventory
        </TabsTrigger>
        <TabsTrigger value="people" disabled>
          People
        </TabsTrigger>
        <TabsTrigger value="pricing" onClick={() => router.push(protectedRoutes.admin.path)}>
          Pricing
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
