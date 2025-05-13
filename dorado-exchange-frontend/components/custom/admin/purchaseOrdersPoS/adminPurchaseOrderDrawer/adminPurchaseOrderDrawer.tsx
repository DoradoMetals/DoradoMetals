'use client'

import AdminPurchaseOrderDrawerHeader from './adminPurchaseOrderDrawerHeader'
import AdminPurchaseOrderDrawerContent from './adminPurchaseOrderDrawerContent'
import AdminPurchaseOrderDrawerFooter from './adminPurchaseOrderDrawerFooter'

import { useAdminUser } from '@/lib/queries/admin/useAdminUser'
import { useAdminPurchaseOrders } from '@/lib/queries/admin/useAdminPurchaseOrders'
import { PurchaseOrderDrawerProps } from '@/types/purchase-order'
import { useDrawerStore } from '@/store/drawerStore'
import Drawer from '@/components/ui/drawer'

export default function AdminPurchaseOrderDrawer({
  order_id,
  user_id,
}: {
  order_id: string
  user_id: string
}) {
  const { activeDrawer, closeDrawer } = useDrawerStore()
  const isDrawerOpen = activeDrawer === 'purchaseOrder'

  const { data: orderUser } = useAdminUser(user_id!, { enabled: isDrawerOpen })
  const { data: purchaseOrders = [] } = useAdminPurchaseOrders()

  const order = purchaseOrders.find((po) => po.id === order_id)

  if (!order) {
    return null
  }

  return (
    <Drawer open={isDrawerOpen} setOpen={closeDrawer}>
      <div className="flex flex-col h-full space-y-4 p-5 flex-1 overflow-y-scroll scrollbar-gutter-stable pb-30 lg:pb-5">
        <AdminPurchaseOrderDrawerHeader
          setIsOrderActive={closeDrawer} // Close when header says to
          order={order}
          username={orderUser?.name ?? ''}
        />

        <AdminPurchaseOrderDrawerContent order={order} />

        <div className="mt-auto">
          <AdminPurchaseOrderDrawerFooter order={order} />
        </div>
      </div>
    </Drawer>
  )
}
