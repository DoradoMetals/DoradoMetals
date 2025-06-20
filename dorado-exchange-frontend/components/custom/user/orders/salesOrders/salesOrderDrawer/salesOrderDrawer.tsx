'use client'

import { useDrawerStore } from '@/store/drawerStore'
import Drawer from '@/components/ui/drawer'
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
    <Drawer open={isDrawerOpen} setOpen={closeDrawer}>
      <div className="flex flex-col h-full max-w-full space-y-4 px-5 py-4 bg-background">
        <SalesOrderDrawerHeader
          order={order}
          username={user?.name ?? ''}
          setIsOrderActive={() => {}}
        />

        <div className="flex-1 overflow-y-auto pb-30 sm:pb-5">
          <SalesOrderDrawerContent order={order} />
        </div>

        <SalesOrderDrawerFooter order={order} />
      </div>
    </Drawer>
  )
}
