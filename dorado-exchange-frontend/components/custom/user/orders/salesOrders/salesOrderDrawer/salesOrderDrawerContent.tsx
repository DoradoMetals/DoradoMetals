import { SalesOrderDrawerContentProps } from '@/types/sales-orders'
import CompletedSalesOrder from './drawerContents/Completed'
import InTransitSalesOrder from './drawerContents/InTransit'
import PreparingSalesOrder from './drawerContents/Preparing'
import PendingSalesOrder from './drawerContents/Pending'

export default function SalesOrderDrawerContent({ order }: SalesOrderDrawerContentProps) {
  switch (order.sales_order_status) {
    case 'Pending':
      return <PendingSalesOrder order={order} />
    case 'Preparing':
      return <PreparingSalesOrder order={order} />
    case 'In Transit':
      return <InTransitSalesOrder order={order} />
    case 'Completed':
      return <CompletedSalesOrder order={order} />
    default:
      return (
        <div className="p-4 text-sm text-neutral-800">No content available for this status.</div>
      )
  }
}

