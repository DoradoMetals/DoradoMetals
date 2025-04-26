'use client'

import OrderDrawer from '@/components/drawers/orderDrawer'
import PurchaseOrderDrawerContent from './purchaseOrderDrawerContent'
import PurchaseOrderDrawerHeader from './purchaseOrderDrawerHeader'
import PurchaseOrderDrawerFooter from './purchaseOrderDrawerFooter'
import { PurchaseOrderDrawerProps } from '@/types/purchase-order'
import { useAdminPurchaseOrders } from '@/lib/queries/admin/useAdminPurchaseOrders'

export default function PurchaseOrderDrawer({
  order_id,
  user,
  isOrderActive,
  setIsOrderActive,
}: PurchaseOrderDrawerProps) {
  const { data: purchaseOrders = [] } = useAdminPurchaseOrders()

  const order = purchaseOrders.find((po) => po.id === order_id)

  if (!order) {
    return null
  }

  return (
    <OrderDrawer open={isOrderActive} setOpen={setIsOrderActive}>
      <div className="flex flex-col h-full space-y-4 p-5 flex-1 overflow-y-scroll scrollbar-gutter-stable pb-30 lg:pb-5">
        <PurchaseOrderDrawerHeader
          order={order}
          username={user?.name ?? ''}
          setIsOrderActive={setIsOrderActive}
        />
        <PurchaseOrderDrawerContent order={order} />

        <div className="mt-auto">
          <PurchaseOrderDrawerFooter order={order} />
        </div>
      </div>
    </OrderDrawer>
  )
}
