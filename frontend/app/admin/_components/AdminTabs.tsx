'use client'

import NextLink from 'next/link'
import { TabsNav } from '@dorado/components'

import { protectedRoutes } from '@/shared/types/routes'

export type AdminTab = 'orders' | 'people' | 'pricing'

export function AdminTabs({ active }: { active: AdminTab }) {
  return (
    <TabsNav
      aria-label="Admin"
      linkComponent={NextLink}
      current={active}
      items={[
        { value: 'orders', label: 'Orders', href: protectedRoutes.adminOrders.path },
        { value: 'inventory', label: 'Inventory', disabled: true },
        { value: 'people', label: 'People', href: protectedRoutes.adminLeads.path },
        { value: 'pricing', label: 'Pricing', href: protectedRoutes.admin.path },
      ]}
    />
  )
}
