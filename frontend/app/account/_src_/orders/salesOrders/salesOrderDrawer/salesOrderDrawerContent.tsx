import InTransitSalesOrder from './drawerContents/InTransit'
import PendingSalesOrder from './drawerContents/Pending'
import PreparingSalesOrder from './drawerContents/Preparing'
import OrderCompletedReview from '../../ui/OrderCompletedReview'
import { SalesOrderDrawerContentProps } from '@/shared/types/salesOrders'

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
      return (
        <OrderCompletedReview
          orderId={order.id}
          direction="sale"
          existingReview={order.review_created}
        />
      )
    default:
      return (
        <strong className="p-4">No content available for this status.</strong>
      )
  }
}

