'use client'

import AdminSalesOrderDrawerHeader from '@/features/orders/salesOrders/admin/adminSalesOrderDrawer/adminSalesOrderDrawerHeader'
import AdminSalesOrderDrawerContent from '@/features/orders/salesOrders/admin/adminSalesOrderDrawer/adminSalesOrderDrawerContent'
import AdminSalesOrderDrawerFooter from '@/features/orders/salesOrders/admin/adminSalesOrderDrawer/adminSalesOrderDrawerFooter'
import OrderDrawerShell from '@/features/orders/ui/OrderDrawerShell'

export default function AdminSalesOrderDrawer({ order_id }: { order_id: string }) {
  return (
    <OrderDrawerShell
      drawerKey="salesOrder"
      orderId={order_id}
      label="Sales order"
      headerClosesDrawer
      Header={AdminSalesOrderDrawerHeader}
      Content={AdminSalesOrderDrawerContent}
      Footer={AdminSalesOrderDrawerFooter}
    />
  )
}
