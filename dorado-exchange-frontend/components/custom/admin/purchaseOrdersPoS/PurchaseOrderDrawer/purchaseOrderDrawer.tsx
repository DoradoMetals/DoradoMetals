'use client'

import { PurchaseOrderDrawerProps } from '@/types/admin'
import OrderDrawer from '@/components/drawers/orderDrawer'
import PurchaseOrderDrawerHeader from './purchaseOrderDrawerHeader'
import { useAdminUser } from '@/lib/queries/admin/useAdminUser'
import PurchaseOrderDrawerContent from './purchaseOrderDrawerContent'

export default function PurchaseOrderDrawer({
  order,
  user_id,
  isOrderActive,
  setIsOrderActive,
}: PurchaseOrderDrawerProps) {
  const { data: user } = useAdminUser(user_id, { enabled: isOrderActive })

  return (
    <OrderDrawer open={isOrderActive} setOpen={setIsOrderActive}>
      <div className="space-y-4 p-5">
        <PurchaseOrderDrawerHeader order={order} username={user?.name ?? ''} />
        <PurchaseOrderDrawerContent order={order} />
      </div>
    </OrderDrawer>
  )
}
