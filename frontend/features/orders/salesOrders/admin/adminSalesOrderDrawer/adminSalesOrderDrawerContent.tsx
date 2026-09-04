import AdminCompletedSalesOrder from '@/features/orders/salesOrders/admin/adminSalesOrderDrawer/adminSalesOrderDrawerContents/AdminCompleted'
import AdminInTransitSalesOrder from '@/features/orders/salesOrders/admin/adminSalesOrderDrawer/adminSalesOrderDrawerContents/AdminInTransit'
import AdminPendingSalesOrder from '@/features/orders/salesOrders/admin/adminSalesOrderDrawer/adminSalesOrderDrawerContents/AdminPending'
import AdminPreparingSalesOrder from '@/features/orders/salesOrders/admin/adminSalesOrderDrawer/adminSalesOrderDrawerContents/AdminPreparing'
import { SalesOrderDrawerContentProps } from '@/features/orders/salesOrders/types'

export default function AdminSalesOrderDrawerContent({ view }: SalesOrderDrawerContentProps) {
  const { order } = view

  switch (order.status) {
    case 'Pending':
      return <AdminPendingSalesOrder view={view} />
    case 'Preparing':
      return <AdminPreparingSalesOrder view={view} />
    case 'In Transit':
      return <AdminInTransitSalesOrder view={view} />
    case 'Completed':
      return <AdminCompletedSalesOrder view={view} />
    default:
      return (
        <strong className="p-4">No content available for this status.</strong>
      )
  }
}
