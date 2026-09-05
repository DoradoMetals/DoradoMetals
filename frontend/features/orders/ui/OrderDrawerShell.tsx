'use client'

import type { ComponentType } from 'react'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { Drawer } from '@dorado/components'
import { useOrder } from '@dorado/client'
import type { OrderDrawerHeaderProps, OrderViewProps } from '@/features/orders/types'
import type { User } from '@/features/users/types'

export type OrderDrawerShellProps = {
  drawerKey: string
  orderId: string
  label: string
  user?: User
  className?: string
  contentClassName?: string
  footerClassName?: string | null
  headerClosesDrawer?: boolean
  Header: ComponentType<OrderDrawerHeaderProps>
  Content: ComponentType<OrderViewProps>
  Footer: ComponentType<OrderViewProps>
}

export default function OrderDrawerShell({
  drawerKey,
  orderId,
  label,
  user,
  className,
  contentClassName = 'mb-8',
  footerClassName = 'mt-auto',
  headerClosesDrawer = false,
  Header,
  Content,
  Footer,
}: OrderDrawerShellProps) {
  const { activeDrawer, closeDrawer } = useDrawerStore()
  const isDrawerOpen = activeDrawer === drawerKey

  const { data: view } = useOrder(orderId, isDrawerOpen)

  if (!view) return null

  const username = user?.name ?? view.user?.name ?? ''

  return (
    <Drawer label={label} open={isDrawerOpen} setOpen={closeDrawer} className={className}>
      <Header
        view={view}
        username={username}
        setIsOrderActive={headerClosesDrawer ? closeDrawer : () => {}}
      />

      <div className={contentClassName}>
        <Content view={view} />
      </div>

      {footerClassName ? (
        <div className={footerClassName}>
          <Footer view={view} />
        </div>
      ) : (
        <Footer view={view} />
      )}
    </Drawer>
  )
}
