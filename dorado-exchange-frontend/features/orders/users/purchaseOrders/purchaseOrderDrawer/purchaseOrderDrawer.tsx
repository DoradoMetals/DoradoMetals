'use client'

import PurchaseOrderDrawerContent from './purchaseOrderDrawerContent'
import PurchaseOrderDrawerHeader from './purchaseOrderDrawerHeader'
import PurchaseOrderDrawerFooter from './purchaseOrderDrawerFooter'
import { PurchaseOrderDrawerProps } from '@/types/purchase-order'
import { useDrawerStore } from '@/store/drawerStore'
import Drawer from '@/shared/ui/base/drawer'
import { useMemo } from 'react'
import { usePurchaseOrders } from '@/lib/queries/usePurchaseOrders'

export default function PurchaseOrderDrawer({ order_id, user }: PurchaseOrderDrawerProps) {
  const { data: orders = [] } = usePurchaseOrders()
  const order = useMemo(() => orders.find((o) => o.id === order_id), [orders, order_id])

  const { activeDrawer, closeDrawer } = useDrawerStore()

  const isDrawerOpen = activeDrawer === 'purchaseOrder'

  if (!order) {
    return null
  }

  return (
    <Drawer open={isDrawerOpen} setOpen={closeDrawer} className="bg-background">
      <PurchaseOrderDrawerHeader
        order={order}
        username={user?.name ?? ''}
        setIsOrderActive={() => {}}
      />
      <div className="mb-8">
        <PurchaseOrderDrawerContent order={order} />
      </div>

      <div className="mt-auto">
        <PurchaseOrderDrawerFooter order={order} />
      </div>
    </Drawer>
  )
}
