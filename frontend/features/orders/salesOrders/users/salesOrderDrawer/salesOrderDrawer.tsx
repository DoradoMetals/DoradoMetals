'use client'

import { useDrawerStore } from '@/shared/store/drawerStore'
import Drawer from '@/shared/ui/base/drawer'
import { useOrder } from '@dorado/client'
import { SalesOrderDrawerProps } from '@/features/orders/salesOrders/types'
import SalesOrderDrawerHeader from '@/features/orders/salesOrders/users/salesOrderDrawer/salesOrderDrawerHeader'
import SalesOrderDrawerContent from '@/features/orders/salesOrders/users/salesOrderDrawer/salesOrderDrawerContent'
import SalesOrderDrawerFooter from '@/features/orders/salesOrders/users/salesOrderDrawer/salesOrderDrawerFooter'

export default function SalesOrderDrawer({ order_id, user }: SalesOrderDrawerProps) {
  const { activeDrawer, closeDrawer } = useDrawerStore()
  const isDrawerOpen = activeDrawer === 'salesOrder'

  const { data: view } = useOrder(order_id, isDrawerOpen)

  if (!view) return null

  return (
    <Drawer label="Sales order" open={isDrawerOpen} setOpen={closeDrawer} className="max-w-full">
      <SalesOrderDrawerHeader
        view={view}
        username={user?.name ?? view.user?.name ?? ''}
        setIsOrderActive={() => {}}
      />

      <div className="flex-1 overflow-y-auto pb-30 sm:pb-5">
        <SalesOrderDrawerContent view={view} />
      </div>

      <SalesOrderDrawerFooter view={view} />
    </Drawer>
  )
}
