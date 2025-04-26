'use client'

import OrderDrawer from '@/components/drawers/orderDrawer'
import AdminPurchaseOrderDrawerHeader from './adminPurchaseOrderDrawerHeader'
import AdminPurchaseOrderDrawerContent from './adminPurchaseOrderDrawerContent'

import { useAdminUser } from '@/lib/queries/admin/useAdminUser'
import { PurchaseOrderDrawerProps } from '@/types/purchase-order'
import AdminPurchaseOrderDrawerFooter from './adminPurchaseOrderDrawerFooter'
import { useAdminPurchaseOrders } from '@/lib/queries/admin/useAdminPurchaseOrders'

export default function AdminPurchaseOrderDrawer({
  order_id,
  user_id,
  isOrderActive,
  setIsOrderActive,
}: PurchaseOrderDrawerProps) {
  const { data: orderUser } = useAdminUser(user_id!, { enabled: isOrderActive })
  const { data: purchaseOrders = [] } = useAdminPurchaseOrders()

  const order = purchaseOrders.find((po) => po.id === order_id)

  if (!order) {
    return null
  }

  return (
    <OrderDrawer open={isOrderActive} setOpen={setIsOrderActive}>
      <div className="flex flex-col h-full space-y-4 p-5 flex-1 overflow-y-scroll scrollbar-gutter-stable pb-30 lg:pb-5">
        <AdminPurchaseOrderDrawerHeader
          setIsOrderActive={setIsOrderActive}
          order={order}
          username={orderUser?.name ?? ''}
        />

        <AdminPurchaseOrderDrawerContent order={order} />

        <div className="mt-auto">
          <AdminPurchaseOrderDrawerFooter order={order} />
        </div>
      </div>
    </OrderDrawer>
  )
}