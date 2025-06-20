'use client'

import { useAdminUser } from '@/lib/queries/admin/useAdminUser'
import { useDrawerStore } from '@/store/drawerStore'
import Drawer from '@/components/ui/drawer'
import { useMemo } from 'react'
import AdminSalesOrderDrawerHeader from './adminSalesOrderDrawerHeader'
import AdminSalesOrderDrawerContent from './adminSalesOrderDrawerContent'
import AdminSalesOrderDrawerFooter from './adminSalesOrderDrawerFooter'
import { useAdminSalesOrders } from '@/lib/queries/admin/useAdminSalesOrders'

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
    <Drawer open={isDrawerOpen} setOpen={closeDrawer}>
      <div className="flex flex-col flex-1 h-full space-y-4 p-5 overflow-y-scroll sm:overflow-y-auto pb-30 sm:pb-5 bg-background">
        <AdminSalesOrderDrawerHeader
          setIsOrderActive={closeDrawer}
          order={order}
          username={orderUser?.name ?? ''}
        />

        <AdminSalesOrderDrawerContent order={order} />

        <div className="mt-auto">
          <AdminSalesOrderDrawerFooter order={order} />
        </div>
      </div>
    </Drawer>
  )
}
