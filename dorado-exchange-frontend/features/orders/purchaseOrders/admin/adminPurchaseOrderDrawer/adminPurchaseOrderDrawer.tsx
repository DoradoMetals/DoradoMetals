'use client'

import AdminPurchaseOrderDrawerHeader from './adminPurchaseOrderDrawerHeader'
import AdminPurchaseOrderDrawerContent from './adminPurchaseOrderDrawerContent'
import AdminPurchaseOrderDrawerFooter from './adminPurchaseOrderDrawerFooter'

import { useDrawerStore } from '@/shared/store/drawerStore'
import Drawer from '@/shared/ui/base/drawer'
import { useMemo } from 'react'
import { useAdminUser } from '@/features/users/queries'
import { useAdminPurchaseOrders } from '@/features/orders/purchaseOrders/admin/queries'

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
  const { data: orders = [] } = useAdminPurchaseOrders()

  const order = useMemo(() => orders.find((o) => o.id === order_id), [orders, order_id])

  if (!order) {
    return null
  }

  return (
    <Drawer open={isDrawerOpen} setOpen={closeDrawer}>
      <AdminPurchaseOrderDrawerHeader
        setIsOrderActive={closeDrawer}
        order={order}
        username={orderUser?.name ?? ''}
      />

      <div className="mb-8">
        <AdminPurchaseOrderDrawerContent order={order} />
      </div>
      <div className="mt-auto">
        <AdminPurchaseOrderDrawerFooter order={order} />
      </div>
    </Drawer>
  )
}
