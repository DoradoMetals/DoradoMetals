'use client'

import PurchaseOrderDrawerContent from './purchaseOrderDrawerContent'
import PurchaseOrderDrawerHeader from './purchaseOrderDrawerHeader'
import PurchaseOrderDrawerFooter from './purchaseOrderDrawerFooter'
import { PurchaseOrderDrawerProps } from '@/types/purchase-order'
import { useAdminPurchaseOrders } from '@/lib/queries/admin/useAdminPurchaseOrders'
import { useDrawerStore } from '@/store/drawerStore'
import Drawer from '@/components/ui/drawer'

export default function PurchaseOrderDrawer({ order_id, user }: PurchaseOrderDrawerProps) {
  const { data: purchaseOrders = [] } = useAdminPurchaseOrders()
  const { activeDrawer, closeDrawer } = useDrawerStore()

  const isDrawerOpen = activeDrawer === 'purchaseOrder'
  const order = purchaseOrders.find((po) => po.id === order_id)

  if (!order) {
    return null
  }

  return (
    <Drawer open={isDrawerOpen} setOpen={closeDrawer}>
      <div className="flex flex-col h-full space-y-4 p-5 flex-1 overflow-y-scroll scrollbar-gutter-stable pb-30 lg:pb-5">
        <PurchaseOrderDrawerHeader
          order={order}
          username={user?.name ?? ''}
          setIsOrderActive={() => {}}
        />
        <PurchaseOrderDrawerContent order={order} />

        <div className="mt-auto">
          <PurchaseOrderDrawerFooter order={order} />
        </div>
      </div>
    </Drawer>
  )
}
