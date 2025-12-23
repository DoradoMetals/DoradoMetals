'use client'

import { useDrawerStore } from '@/store/drawerStore'
import Drawer from '@/shared/ui/base/drawer'
import { useMemo } from 'react'
import AdminSalesOrderDrawerHeader from './adminSalesOrderDrawerHeader'
import AdminSalesOrderDrawerContent from './adminSalesOrderDrawerContent'
import AdminSalesOrderDrawerFooter from './adminSalesOrderDrawerFooter'
import { useAdminSalesOrders } from '@/features/orders/admin/salesOrders/queries'
import { useAdminUser } from '@/features/users/queries'

export default function AdminSalesOrderDrawer({
  order_id,
  user_id,
}: {
  order_id: string
  user_id: string
}) {
  const { activeDrawer, closeDrawer } = useDrawerStore()
  const isDrawerOpen = activeDrawer === 'salesOrder'

  const { data: orderUser } = useAdminUser(user_id!, { enabled: isDrawerOpen })
  const { data: orders = [] } = useAdminSalesOrders()

  const order = useMemo(() => orders.find((o) => o.id === order_id), [orders, order_id])

  if (!order) {
    return null
  }

  return (
    <Drawer open={isDrawerOpen} setOpen={closeDrawer} className="bg-background">
      <AdminSalesOrderDrawerHeader
        setIsOrderActive={closeDrawer}
        order={order}
        username={orderUser?.name ?? ''}
      />

      <div className="mb-8">
        <AdminSalesOrderDrawerContent order={order} />
      </div>
      <div className="mt-auto">
        <AdminSalesOrderDrawerFooter order={order} />
      </div>
    </Drawer>
  )
}
