'use client'

import OrderDrawer from '@/components/drawers/orderDrawer'
import PurchaseOrderDrawerContent from './purchaseOrderDrawerContent'
import PurchaseOrderDrawerHeader from './purchaseOrderDrawerHeader'
import PurchaseOrderDrawerFooter from './purchaseOrderDrawerFooter'
import { PurchaseOrderDrawerProps } from '@/types/purchase-order'

export default function PurchaseOrderDrawer({
  order,
  user,
  isOrderActive,
  setIsOrderActive,
}: PurchaseOrderDrawerProps) {

  return (
    <OrderDrawer open={isOrderActive} setOpen={setIsOrderActive}>
      <div className="flex flex-col h-full space-y-4 p-5">
        <PurchaseOrderDrawerHeader order={order} username={user?.name ?? ''} />
        <PurchaseOrderDrawerContent order={order} />

        <div className="lg:mt-auto">
          <PurchaseOrderDrawerFooter order={order} />
        </div>
      </div>
    </OrderDrawer>
  )
}
