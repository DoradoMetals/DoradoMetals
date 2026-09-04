'use client'

import ProtectedPage from '@/features/auth/hooks/useProtectedPage'
import { protectedRoutes } from '@/features/routes/types'
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
  CaretLeftIcon,
  ShippingContainerIcon,
  TruckIcon,
} from '@phosphor-icons/react'

import {
  SidebarLayout,
  SidebarSection,
  useSidebarQueryParamSelection,
} from '@/shared/ui/SidebarLayout'
import { userRoleOptions } from '@/features/users/types'
import { useGetSession } from '@/features/auth/queries'
import { Button, Drawer } from '@dorado/components'
import { useDrawerStore } from '@/shared/store/drawerStore'

import { UsersPage } from '@/features/users/ui/UsersAdminTable'
import LeadsPage from '@/features/leads/ui/LeadsAdminTable'
import ProductsPage from '@/features/products/ui/AdminProductsTable'
import ReviewsPage from '@/features/reviews/ui/ReviewsAdminTable'

import { Suspense } from 'react'
import { useOrders } from '@dorado/client'
import PurchaseOrdersPage from '@/features/orders/purchaseOrders/admin/AdminPurchaseOrders'
import SalesOrdersPage from '@/features/orders/salesOrders/admin/AdminSalesOrders'
import RatesPage from '@/features/rates/ui/RatesAdminTable'
import CarriersPage from '@/features/carriers/ui/CarriersAdminTable'
import CarrierServicesPage from '@/features/carriers/ui/CarrierServicesAdminTable'

export default function Page() {
  return (
    <ProtectedPage requiredRoles={protectedRoutes.admin.roles}>
      <main className="flex flex-col items-center px-5">
        <Suspense fallback={<p>Loading...</p>}>
          <AdminShell />
        </Suspense>
      </main>
    </ProtectedPage>
  )
}

function AdminShell() {
  // Every customer's, both directions - an admin's list is not scoped.
  const { data: purchaseOrders = [] } = useOrders({ direction: 'purchase' })
  const { data: salesOrders = [] } = useOrders({ direction: 'sale' })
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
          { key: 'rates', label: 'Rates', icon: PercentIcon },
        ],
      },
      {
        label: 'Shipping',
        items: [
          { key: 'carriers', label: 'Carriers', icon: ShippingContainerIcon },
          { key: 'carrier_services', label: 'Services', icon: TruckIcon },
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
        return <p>TODO: Profit and Loss</p>
      case 'expenses':
        return <p>TODO: Expenses</p>
      case 'metrics':
        return <p>TODO: Metrics</p>
      case 'users':
        return <UsersPage />
      case 'leads':
        return <LeadsPage />
      case 'reviews':
        return <ReviewsPage />
      case 'bullion':
        return <ProductsPage />
      case 'rates':
        return <RatesPage />
      case 'appointments':
        return <p>TODO: Appointments</p>
      case 'carriers':
        return <CarriersPage />
      case 'carrier_services':
        return <CarrierServicesPage />
      default:
        return null
    }
  }, [selectedKey])

  const { activeDrawer, openDrawer, closeDrawer } = useDrawerStore()

  return (
    <div className="w-full h-full">
      <div className="md:hidden">
        <div className="mx-auto w-full max-w-7xl py-2 flex items-center justify-between">
          <Button
            variant="tertiary"
            onClick={() => openDrawer('adminSidebar')}
            className="flex items-center gap-2"
          >
            <CaretLeftIcon size={24} />
            <span>{currentLabel}</span>
          </Button>
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
          content={content}
          navClass="bg-card border border-border"
        />
      </div>

      <div className="md:hidden">
        {content}
      </div>

      <Drawer label="Admin"
        open={activeDrawer === 'adminSidebar'}
        setOpen={(o) => (o ? openDrawer('adminSidebar') : closeDrawer())}
        anchor="left"
        className="fixed top-0 h-full bg-highest border border-border p-2 rounded-none"
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
