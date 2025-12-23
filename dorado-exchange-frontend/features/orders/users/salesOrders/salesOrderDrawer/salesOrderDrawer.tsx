'use client'

import { useDrawerStore } from '@/store/drawerStore'
import Drawer from '@/shared/ui/base/drawer'
import { useMemo } from 'react'
import SalesOrderDrawerContent from './salesOrderDrawerContent'
import { SalesOrderDrawerProps } from '@/types/sales-orders'
import { useSalesOrders } from '@/lib/queries/useSalesOrders'
import SalesOrderDrawerHeader from './salesOrderDrawerHeader'
import SalesOrderDrawerFooter from './salesOrderDrawerFooter'

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
