'use client'

import * as React from 'react'
import {
  ClipboardTextIcon,
  CurrencyDollarIcon,
  UsersIcon,
  ChatsCircleIcon,
  LassoIcon,
  CalendarIcon,
  CoinsIcon,
  PercentIcon,
  CalculatorIcon,
  WalletIcon,
  ChartLineUpIcon,
  GearIcon,
  ListIcon,
  CaretLeftIcon,
} from '@phosphor-icons/react'
import ProductsInventory from './products/productsInventory'
import ScrapCards from './scrap/ScrapCards'
import AdminPurchaseOrders from './purchaseOrders/AdminPurchaseOrders'
import AdminSalesOrders from './salesOrders/AdminSalesOrders'
import { UsersPage } from './users/usersPage'
import { LeadsPage } from './leads/leadsPage'
import { ReviewsPage } from './reviews/reviewsPage'
import { useAdminSalesOrders } from '@/lib/queries/admin/useAdminSalesOrders'
import { useAdminPurchaseOrders } from '@/lib/queries/admin/useAdminPurchaseOrders'
import { useGetInventory } from '@/lib/queries/admin/useAdminProducts'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import { SidebarLayout, SidebarSection } from '@/components/ui/sidebar'
import { userRoleOptions } from '@/types/user'
import { useGetSession } from '@/lib/queries/useAuth'
import Drawer from '@/components/ui/drawer'
import { cn } from '@/lib/utils'
import { useDrawerStore } from '@/store/drawerStore'
import RatesPage from './rates/ratesPage'

export default function AdminShell() {
  const { data: purchaseOrders = [] } = useAdminPurchaseOrders()
  const { data: salesOrders = [] } = useAdminSalesOrders()
  const { data: productsInventory } = useGetInventory()
  const { data: spotPrices = [] } = useSpotPrices()
  const { user } = useGetSession()

  const currentRole = user?.role ?? 'Admin'
  const roleMeta = userRoleOptions.find((r) => r.value === currentRole) ?? userRoleOptions[0]
  const RoleIcon = roleMeta.icon

  const sections: SidebarSection[] = React.useMemo(
    () => [
      {
        label: 'Orders',
        items: [
          {
            key: 'purchase-orders',
            label: 'Purchase Orders',
            icon: ClipboardTextIcon,
            badge: purchaseOrders.length,
          },
          {
            key: 'sales-orders',
            label: 'Sales Orders',
            icon: CurrencyDollarIcon,
            badge: salesOrders.length,
          },
        ],
      },
      {
        label: 'Customers',
        items: [
          { key: 'users', label: 'Users', icon: UsersIcon },
          { key: 'reviews', label: 'Reviews', icon: ChatsCircleIcon },
          { key: 'leads', label: 'Leads', icon: LassoIcon },
          { key: 'appointments', label: 'Appointments', icon: CalendarIcon },
        ],
      },
      {
        label: 'Accounting',
        items: [
          { key: 'profits', label: 'Profit and Loss', icon: CalculatorIcon },
          { key: 'expenses', label: 'Expenses', icon: WalletIcon },
          { key: 'metrics', label: 'Metrics', icon: ChartLineUpIcon },
        ],
      },
      {
        label: 'Inventory',
        items: [
          { key: 'bullion', label: 'Bullion', icon: CoinsIcon },
          { key: 'scrap', label: 'Scrap', icon: GearIcon },
          { key: 'rates', label: 'Rates', icon: PercentIcon },
        ],
      },
    ],
    [purchaseOrders.length, salesOrders.length]
  )

  const [selectedKey, setSelectedKey] = React.useState<string>(sections[0].items[0].key)

  const currentLabel = React.useMemo(() => {
    for (const s of sections) {
      const found = s.items.find((i) => i.key === selectedKey)
      if (found) return found.label
    }
    return 'Home'
  }, [sections, selectedKey])

  const content = React.useMemo(() => {
    switch (selectedKey) {
      case 'purchase-orders':
        return <AdminPurchaseOrders />
      case 'sales-orders':
        return <AdminSalesOrders />
      case 'profits':
        return <div className="text-sm text-neutral-700">TODO: Profit and Loss</div>
      case 'expenses':
        return <div className="text-sm text-neutral-700">TODO: Expenses</div>
      case 'metrics':
        return <div className="text-sm text-neutral-700">TODO: Metrics</div>
      case 'users':
        return <UsersPage />
      case 'leads':
        return <LeadsPage />
      case 'reviews':
        return <ReviewsPage />
      case 'bullion':
        return <ProductsInventory />
      case 'scrap':
        return <ScrapCards />
      case 'rates':
        return <RatesPage />
      default:
        return null
    }
  }, [selectedKey, productsInventory, spotPrices])

  const { activeDrawer, openDrawer, closeDrawer } = useDrawerStore()

  return (
    <div className="w-full h-full">
      <div className="md:hidden">
        <div className="mx-auto w-full max-w-7xl px-3 py-2 flex items-center justify-between">
          <button
            onClick={() => openDrawer('adminSidebar')}
            className="flex items-center gap-2 text-neutral-800 hover:text-primary"
          >
            <CaretLeftIcon size={24} />
            <span className="text-base font-medium ">{currentLabel}</span>
          </button>
        </div>
      </div>

      <div className="hidden md:block">
        <SidebarLayout
          sections={sections}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          headerEnabled
          footerEnabled
          roleIcon={RoleIcon}
          roleTitle="Dorado Admin"
          roleSubtitle={roleMeta.label ?? 'Admin'}
          content={<div className="mx-auto w-full max-w-7xl px-3">{content}</div>}
          navClass="raised-off-page"
        />
      </div>

      <div className="md:hidden">
        <main className="mx-auto w-full max-w-7xl px-3 py-4">{content}</main>
      </div>

      <Drawer
        open={activeDrawer === 'adminSidebar'}
        setOpen={(o) => (o ? openDrawer('adminSidebar') : closeDrawer())}
        anchor="left"
        className={cn('fixed top-0 h-full bg-card p-2 shadow-2xl rounded-none')}
      >
        <SidebarLayout
          sections={sections}
          selectedKey={selectedKey}
          onSelect={(k) => {
            setSelectedKey(k)
            closeDrawer()
          }}
          headerEnabled
          footerEnabled={false}
          roleIcon={RoleIcon}
          roleTitle="Dorado Admin"
          roleSubtitle={roleMeta.label ?? 'Admin'}
          navClass="flex-1 overflow-y-auto"
          navOnly
          forcedOpen
        />
      </Drawer>
    </div>
  )
}
