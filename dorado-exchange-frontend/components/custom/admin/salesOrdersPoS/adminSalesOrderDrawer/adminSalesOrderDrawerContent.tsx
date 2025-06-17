import { SalesOrderDrawerContentProps } from '@/types/sales-orders'
import AdminPendingSalesOrder from './adminSalesOrderDrawerContents/AdminPending'
import AdminPreparingSalesOrder from './adminSalesOrderDrawerContents/AdminPreparing'
import AdminInTransitSalesOrder from './adminSalesOrderDrawerContents/AdminInTransit'
import AdminCompletedSalesOrder from './adminSalesOrderDrawerContents/AdminCompleted'

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
