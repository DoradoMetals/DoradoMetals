'use client'

import AdminPurchaseOrderDrawerHeader from './adminPurchaseOrderDrawerHeader'
import AdminPurchaseOrderDrawerContent from './adminPurchaseOrderDrawerContent'
import AdminPurchaseOrderDrawerFooter from './adminPurchaseOrderDrawerFooter'

import { useAdminUser } from '@/lib/queries/admin/useAdminUser'
import { useAdminPurchaseOrders } from '@/lib/queries/admin/useAdminPurchaseOrders'
import { useDrawerStore } from '@/store/drawerStore'
import Drawer from '@/components/ui/drawer'
import { useMemo } from 'react'

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
    <Drawer open={isDrawerOpen} setOpen={closeDrawer} className="bg-background">
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
