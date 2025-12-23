'use client'

import ProtectedPage from '@/features/auth/hooks/useProtectedPage'
import { protectedRoutes } from '@/types/routes'
;('use client')

import { useMemo } from 'react'
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
  CaretLeftIcon,
} from '@phosphor-icons/react'

import { useAdminSalesOrders } from '@/features/orders/admin/salesOrders/queries'
import {
  SidebarLayout,
  SidebarSection,
  useSidebarQueryParamSelection,
} from '@/shared/ui/SidebarLayout'
import { userRoleOptions } from '@/types/user'
import { useGetSession } from '@/features/auth/queries'
import Drawer from '@/shared/ui/base/drawer'
import { cn } from '@/shared/utils/cn'
import { useDrawerStore } from '@/store/drawerStore'
import PurchaseOrdersPage from '@/features/orders/admin/purchaseOrders/AdminPurchaseOrders'
import SalesOrdersPage from '@/features/orders/admin/salesOrders/AdminSalesOrders'
import { UsersPage } from '@/features/users/ui/UsersAdminTable'
import LeadsPage from '@/features/leads/ui/LeadsAdminTable'
import ProductsPage from '@/features/products/ui/AdminProductsTable'
import ScrapCards from '@/features/scrap/ui/AdminScrapCards'
import RatesPage from '@/app/rates/page'
import ReviewsPage from '@/features/reviews/ui/ReviewsAdminTable'

import { Suspense } from 'react'
import { useSpotPrices } from '@/features/spots/queries';
import { useAdminPurchaseOrders } from '@/features/orders/admin/purchaseOrders/queries';

export default function Page() {
  return (
    <ProtectedPage requiredRoles={protectedRoutes.admin.roles}>
      <div className="flex flex-col items-center px-5">
        <Suspense fallback={<p>Loading...</p>}>
          <AdminShell />
        </Suspense>
      </div>
    </ProtectedPage>
  )
}

function AdminShell() {
  const { data: purchaseOrders = [] } = useAdminPurchaseOrders()
  const { data: salesOrders = [] } = useAdminSalesOrders()
  const { data: spotPrices = [] } = useSpotPrices()
  const { user } = useGetSession()

  const currentRole = user?.role ?? 'Admin'
  const roleMeta = userRoleOptions.find((r) => r.value === currentRole) ?? userRoleOptions[0]
  const RoleIcon = roleMeta.icon

  const sections: SidebarSection[] = useMemo(
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

  const { selectedKey, handleSelect } = useSidebarQueryParamSelection(sections, {
    paramKey: 'tab',
    defaultKey: 'purchase-orders',
  })

  const currentLabel = useMemo(() => {
    for (const s of sections) {
      const found = s.items.find((i) => i.key === selectedKey)
      if (found) return found.label
    }
    return 'Home'
  }, [sections, selectedKey])

  const content = useMemo(() => {
    switch (selectedKey) {
      case 'purchase-orders':
        return <PurchaseOrdersPage />
      case 'sales-orders':
        return <SalesOrdersPage />
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
        return <ProductsPage />
      case 'scrap':
        return <ScrapCards />
      case 'rates':
        return <RatesPage />
      case 'appointments':
        return <div className="text-sm text-neutral-700">TODO: Appointments</div>
      default:
        return null
    }
  }, [selectedKey, spotPrices])

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
          onSelect={handleSelect}
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
            handleSelect(k)
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
