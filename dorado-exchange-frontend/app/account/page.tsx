'use client'

import { Button } from '@/shared/ui/base/button'
import { UserRoundX } from 'lucide-react'
import { useRouter } from 'next/navigation'
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
} from '@/shared/ui/SidebarLayout'
import { userRoleOptions } from '@/features/users/types'
import { useGetSession } from '@/features/auth/queries'
import Drawer from '@/shared/ui/base/drawer'
import { cn } from '@/shared/utils/cn'
import { useDrawerStore } from '@/store/drawerStore'
import { useSalesOrders } from '@/features/orders/users/salesOrders/queries'
import AddressList from '@/features/addresses/ui/AddressList'
import { PurchaseOrdersContent } from '@/features/orders/users/purchaseOrders/purchaseOrderTab'
import { SalesOrdersContent } from '@/features/orders/users/salesOrders/salesOrderTab'
import UserForm from '@/features/users/ui/UserForm'
import { PasswordAndSecurity } from '@/features/users/ui/PasswordAndSecurity'
import { usePurchaseOrders } from '@/features/orders/users/purchaseOrders/queries'

export default function Page() {
  const { user } = useGetSession()
  const router = useRouter()
  return (
    <div className="flex flex-col h-full items-center gap-4">
      {user ? (
        <AccountShell />
      ) : (
        <div className="w-full h-full flex flex-1 flex-col items-center justify-center text-center my-24 max-w-xs">
          <div className="mb-8">
            <UserRoundX size={96} className="text-neutral-800" strokeWidth={1} />
          </div>
          <div className="flex-col items-center gap-1 mb-8">
            <h2 className="text-2xl text-neutral-900 tracking-wide">You're not signed in!</h2>
            <p className="text-sm text-neutral-600">Please sign in to view your account.</p>
          </div>
          <Button
            variant="default"
            className="px-25 max-w-xl bg-primary raised-off-page text-white"
            onClick={() => {
              router.push('/authentication')
            }}
          >
            Sign In
          </Button>
        </div>
      )}
    </div>
  )
}

function AccountShell() {
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
