import AdminCompletedSalesOrder from '@/features/orders/salesOrders/admin/adminSalesOrderDrawer/adminSalesOrderDrawerContents/AdminCompleted'
import AdminInTransitSalesOrder from '@/features/orders/salesOrders/admin/adminSalesOrderDrawer/adminSalesOrderDrawerContents/AdminInTransit'
import AdminPendingSalesOrder from '@/features/orders/salesOrders/admin/adminSalesOrderDrawer/adminSalesOrderDrawerContents/AdminPending'
import AdminPreparingSalesOrder from '@/features/orders/salesOrders/admin/adminSalesOrderDrawer/adminSalesOrderDrawerContents/AdminPreparing'
import { SalesOrderDrawerContentProps } from '@/features/orders/salesOrders/types'


export default function AdminSalesOrderDrawerContent({ order }: SalesOrderDrawerContentProps) {
  switch (order.sales_order_status) {
    case 'Pending':
      return <AdminPendingSalesOrder order={order} />
    case 'Preparing':
      return <AdminPreparingSalesOrder order={order} />
    case 'In Transit':
      return <AdminInTransitSalesOrder order={order} />
    case 'Completed':
      return <AdminCompletedSalesOrder order={order} />
    default:
      return (
        <div className="p-4 text-sm text-neutral-800">No content available for this status.</div>
      )
  }
}
