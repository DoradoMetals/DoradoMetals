'use client'

import { useMemo } from 'react'
import {
  CaretLeftIcon,
  UserCircleIcon,
  LockIcon,
  MoneyIcon,
  CashRegisterIcon,
  AddressBookIcon,
} from '@phosphor-icons/react'
import {
  SidebarLayout,
  SidebarSection,
  useSidebarQueryParamSelection,
} from '@/components/ui/sidebar'
import { userRoleOptions } from '@/types/user'
import { useGetSession } from '@/lib/queries/useAuth'
import Drawer from '@/components/ui/drawer'
import { cn } from '@/lib/utils'
import { useDrawerStore } from '@/store/drawerStore'
import { usePurchaseOrders } from '@/lib/queries/usePurchaseOrders'
import { useSalesOrders } from '@/lib/queries/useSalesOrders'
import UserForm from './account/userForm'
import { SalesOrdersContent } from './orders/salesOrders/salesOrderTab'
import { PurchaseOrdersContent } from './orders/purchaseOrders/purchaseOrderTab'
import { PasswordAndSecurity } from './account/passwordAndSecurity'
import AddressList from '@/features/addresses/ui/AddressList'

export default function AccountShell() {
  const { data: purchaseOrders = [] } = usePurchaseOrders()
  const { data: salesOrders = [] } = useSalesOrders()
  const { user } = useGetSession()

  const currentRole = user?.role ?? 'User'
  const roleMeta = userRoleOptions.find((r) => r.value === currentRole) ?? userRoleOptions[0]
  const RoleIcon = roleMeta.icon

  const sections: SidebarSection[] = useMemo(
    () => [
      {
        label: 'Profile',
        items: [
          { key: 'details', label: 'Account Details', icon: UserCircleIcon },
          { key: 'security', label: 'Security', icon: LockIcon },
          { key: 'addresses', label: 'Addresses', icon: AddressBookIcon },
        ],
      },
      {
        label: 'Orders',
        items: [
          {
            key: 'sold',
            label: 'Sold',
            icon: MoneyIcon,
            badge: purchaseOrders.length,
          },
          {
            key: 'bought',
            label: 'Bought',
            icon: CashRegisterIcon,
            badge: salesOrders.length,
          },
        ],
      },
    ],
    [purchaseOrders.length, salesOrders.length]
  )

  const { selectedKey, handleSelect } = useSidebarQueryParamSelection(sections, {
    paramKey: 'tab',
    defaultKey: 'details',
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
      case 'details':
        return <UserForm />
      case 'security':
        return <PasswordAndSecurity />
      case 'addresses':
        return <AddressList />
      case 'sold':
        return <PurchaseOrdersContent />
      case 'bought':
        return <SalesOrdersContent />
      case 'ledger':
        return <div className="text-sm text-neutral-700">TODO: Ledger</div>
      default:
        return null
    }
  }, [selectedKey])

  const { activeDrawer, openDrawer, closeDrawer } = useDrawerStore()

  return (
    <div className="w-full h-full max-w-4xl">
      <div className="md:hidden">
        <div className="w-full py-2 flex items-center justify-between">
          <button
            onClick={() => openDrawer('accountSidebar')}
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
          roleTitle={user?.name ?? ''}
          roleSubtitle={roleMeta.label ?? 'User'}
          content={<div className="w-full px-4">{content}</div>}
          navClass="raised-off-page"
        />
      </div>

      <div className="md:hidden p-4">
        <main className="w-full">{content}</main>
      </div>

      <Drawer
        open={activeDrawer === 'accountSidebar'}
        setOpen={(o) => (o ? openDrawer('accountSidebar') : closeDrawer())}
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
          roleTitle={user?.name ?? ''}
          roleSubtitle={roleMeta.label ?? 'User'}
          navClass="flex-1 overflow-y-auto"
          navOnly
          forcedOpen
        />
      </Drawer>
    </div>
  )
}
