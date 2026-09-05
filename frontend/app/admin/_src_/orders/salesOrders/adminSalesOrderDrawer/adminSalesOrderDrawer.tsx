'use client'

import AdminSalesOrderDrawerHeader from './adminSalesOrderDrawerHeader'
import AdminSalesOrderDrawerContent from './adminSalesOrderDrawerContent'
import AdminSalesOrderDrawerFooter from './adminSalesOrderDrawerFooter'
import OrderDrawerShell from '@/shared/ui/OrderDrawerShell'

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
