'use client'

import { Button, Drawer } from '@dorado/components'
import { Banknote, ChevronLeft, CircleUser, ContactRound, Lock, Store, UserRoundX } from '@dorado/icons'
import { useRouter } from 'next/navigation'
import { useMemo } from 'react'
import {
  SidebarLayout,
  SidebarSection,
  useSidebarQueryParamSelection,
} from '@/shared/ui/SidebarLayout'
import { userRoleOptions } from '@/features/users/types'
import { useGetSession } from '@/features/auth/queries'
import { useDrawerStore } from '@/shared/store/drawerStore'
import AddressList from '@/features/addresses/ui/AddressList'
import UserForm from '@/features/users/ui/UserForm'
import { PasswordAndSecurity } from '@/features/users/ui/PasswordAndSecurity'
import { useOrders } from '@dorado/client'
import { PurchaseOrdersContent } from '@/features/orders/purchaseOrders/users/purchaseOrderTab'
import { SalesOrdersContent } from '@/features/orders/salesOrders/users/salesOrderTab'


export default function Page() {
  const { user } = useGetSession()
  const router = useRouter()
  return (
    <main className="flex flex-col h-full items-center gap-4">
      {user ? (
        <AccountShell />
      ) : (
        <div className="w-full h-full flex flex-1 flex-col items-center justify-center text-center my-24 max-w-xs">
          <div className="mb-8">
            <UserRoundX size={96} strokeWidth={1} />
          </div>
          <div className="flex-col items-center gap-1 mb-8">
            <h1>You're not signed in!</h1>
            <p>Please sign in to view your account.</p>
          </div>
          <Button
            size="xl"
            className="w-full max-w-xl"
            onClick={() => {
              router.push('/authentication')
            }}
          >
            Sign In
          </Button>
        </div>
      )}
    </main>
  )
}

function AccountShell() {
  const { user } = useGetSession()
  // Self-scoped even for an admin caller: `user_id` pins the rows to the
  // session's own, which is what an account page shows.
  const scope = { user_id: user?.id }
  const { data: purchaseOrders = [] } = useOrders({ direction: 'purchase', ...scope }, { enabled: !!user?.id })
  const { data: salesOrders = [] } = useOrders({ direction: 'sale', ...scope }, { enabled: !!user?.id })

  const currentRole = user?.role ?? 'User'
  const roleMeta = userRoleOptions.find((r) => r.value === currentRole) ?? userRoleOptions[0]
  const RoleIcon = roleMeta.icon

  const sections: SidebarSection[] = useMemo(
    () => [
      {
        label: 'Profile',
        items: [
          { key: 'details', label: 'Account Details', icon: CircleUser },
          { key: 'security', label: 'Security', icon: Lock },
          { key: 'addresses', label: 'Addresses', icon: ContactRound },
        ],
      },
      {
        label: 'Orders',
        items: [
          {
            key: 'sold',
            label: 'Sold',
            icon: Banknote,
            badge: purchaseOrders.length,
          },
          {
            key: 'bought',
            label: 'Bought',
            icon: Store,
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
        return <p>TODO: Ledger</p>
      default:
        return null
    }
  }, [selectedKey])

  const { activeDrawer, openDrawer, closeDrawer } = useDrawerStore()

  return (
    <div className="w-full h-full max-w-4xl">
      <div className="md:hidden">
        <div className="w-full py-2 flex items-center justify-between">
          <Button
            variant="tertiary"
            onClick={() => openDrawer('accountSidebar')}
            className="flex items-center gap-2"
          >
            <ChevronLeft size={24} />
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
          roleTitle={user?.name ?? ''}
          roleSubtitle={roleMeta.label ?? 'User'}
          content={<div className="w-full px-4">{content}</div>}
          navClass="bg-card border border-border"
        />
      </div>

      <div className="md:hidden p-4">
        <div className="w-full">{content}</div>
      </div>

      <Drawer
        open={activeDrawer === 'accountSidebar'}
        setOpen={(o) => (o ? openDrawer('accountSidebar') : closeDrawer())}
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
