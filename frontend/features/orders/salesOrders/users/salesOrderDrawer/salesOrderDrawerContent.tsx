import CompletedSalesOrder from '@/features/orders/salesOrders/users/salesOrderDrawer/drawerContents/Completed'
import InTransitSalesOrder from '@/features/orders/salesOrders/users/salesOrderDrawer/drawerContents/InTransit'
import PendingSalesOrder from '@/features/orders/salesOrders/users/salesOrderDrawer/drawerContents/Pending'
import PreparingSalesOrder from '@/features/orders/salesOrders/users/salesOrderDrawer/drawerContents/Preparing'
import { SalesOrderDrawerContentProps } from '@/features/orders/salesOrders/types'

export default function SalesOrderDrawerContent({ view }: SalesOrderDrawerContentProps) {
  const { order } = view

  switch (order.status) {
    case 'Pending':
      return <PendingSalesOrder view={view} />
    case 'Preparing':
      return <PreparingSalesOrder view={view} />
    case 'In Transit':
      return <InTransitSalesOrder view={view} />
    case 'Completed':
      return <CompletedSalesOrder view={view} />
    default:
      return (
        <strong className="p-4">No content available for this status.</strong>
      )
  }
}

