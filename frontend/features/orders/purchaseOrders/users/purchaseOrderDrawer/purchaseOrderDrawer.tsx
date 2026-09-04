'use client'

import PurchaseOrderDrawerContent from './purchaseOrderDrawerContent'
import PurchaseOrderDrawerHeader from './purchaseOrderDrawerHeader'
import PurchaseOrderDrawerFooter from './purchaseOrderDrawerFooter'
import { PurchaseOrderDrawerProps } from '@/features/orders/purchaseOrders/types'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { Drawer } from '@dorado/components'
import { useOrder } from '@dorado/client'

export default function PurchaseOrderDrawer({ order_id, user }: PurchaseOrderDrawerProps) {
  const { activeDrawer, closeDrawer } = useDrawerStore()
  const isDrawerOpen = activeDrawer === 'purchaseOrder'

  const { data: view } = useOrder(order_id, isDrawerOpen)

  if (!view) return null

  return (
    <Drawer label="Purchase order" open={isDrawerOpen} setOpen={closeDrawer}>
      <PurchaseOrderDrawerHeader
        view={view}
        username={user?.name ?? view.user?.name ?? ''}
        setIsOrderActive={() => {}}
      />
      <div className="mb-8">
        <PurchaseOrderDrawerContent view={view} />
      </div>

      <div className="mt-auto">
        <PurchaseOrderDrawerFooter view={view} />
      </div>
    </Drawer>
  )
}
