'use client'

import { useDrawerStore } from '@/shared/store/drawerStore'
import { Drawer } from '@dorado/components'
import { useOrder } from '@dorado/client'
import AdminSalesOrderDrawerHeader from '@/features/orders/salesOrders/admin/adminSalesOrderDrawer/adminSalesOrderDrawerHeader'
import AdminSalesOrderDrawerContent from '@/features/orders/salesOrders/admin/adminSalesOrderDrawer/adminSalesOrderDrawerContent'
import AdminSalesOrderDrawerFooter from '@/features/orders/salesOrders/admin/adminSalesOrderDrawer/adminSalesOrderDrawerFooter'

export default function AdminSalesOrderDrawer({ order_id }: { order_id: string }) {
  const { activeDrawer, closeDrawer } = useDrawerStore()
  const isDrawerOpen = activeDrawer === 'salesOrder'

  const { data: view } = useOrder(order_id, isDrawerOpen)

  if (!view) return null

  return (
    <Drawer label="Sales order" open={isDrawerOpen} setOpen={closeDrawer}>
      <AdminSalesOrderDrawerHeader
        setIsOrderActive={closeDrawer}
        view={view}
        username={view.user?.name ?? ''}
      />

      <div className="mb-8">
        <AdminSalesOrderDrawerContent view={view} />
      </div>
      <div className="mt-auto">
        <AdminSalesOrderDrawerFooter view={view} />
      </div>
    </Drawer>
  )
}
