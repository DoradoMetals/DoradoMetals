import AdminCompletedSalesOrder from './adminSalesOrderDrawerContents/AdminCompleted'
import AdminInTransitSalesOrder from './adminSalesOrderDrawerContents/AdminInTransit'
import AdminPendingSalesOrder from './adminSalesOrderDrawerContents/AdminPending'
import AdminPreparingSalesOrder from './adminSalesOrderDrawerContents/AdminPreparing'
import { SalesOrderDrawerContentProps } from '@/shared/types/salesOrders'

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
      return <strong className="p-4">No content available for this status.</strong>
  }
}
