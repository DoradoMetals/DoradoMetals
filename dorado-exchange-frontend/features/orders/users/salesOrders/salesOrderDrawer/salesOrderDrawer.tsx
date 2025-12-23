'use client'

import { useDrawerStore } from '@/store/drawerStore'
import Drawer from '@/shared/ui/base/drawer'
import { useMemo } from 'react'
import { SalesOrderDrawerProps } from '@/types/sales-orders'
import { useSalesOrders } from '@/features/orders/users/salesOrders/queries'
import SalesOrderDrawerHeader from '@/features/orders/users/salesOrders/salesOrderDrawer/salesOrderDrawerHeader'
import SalesOrderDrawerContent from '@/features/orders/users/salesOrders/salesOrderDrawer/salesOrderDrawerContent'
import SalesOrderDrawerFooter from '@/features/orders/users/salesOrders/salesOrderDrawer/salesOrderDrawerFooter'


export default function SalesOrderDrawer({ order_id, user }: SalesOrderDrawerProps) {
  const { data: orders = [] } = useSalesOrders()
  const order = useMemo(() => orders.find((o) => o.id === order_id), [orders, order_id])

  const { activeDrawer, closeDrawer } = useDrawerStore()

  const isDrawerOpen = activeDrawer === 'salesOrder'

  if (!order) {
    return null
  }

  return (
    <Drawer open={isDrawerOpen} setOpen={closeDrawer} className="bg-background max-w-full">
      <SalesOrderDrawerHeader
        order={order}
        username={user?.name ?? ''}
        setIsOrderActive={() => {}}
      />

      <div className="flex-1 overflow-y-auto pb-30 sm:pb-5">
        <SalesOrderDrawerContent order={order} />
      </div>

      <SalesOrderDrawerFooter order={order} />
    </Drawer>
  )
}
