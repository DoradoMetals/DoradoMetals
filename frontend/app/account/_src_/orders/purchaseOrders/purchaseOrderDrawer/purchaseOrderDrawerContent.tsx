import CancelledPurchaseOrder from './drawerContents/Cancelled'
import InTransitPurchaseOrder from './drawerContents/InTransit'
import PaymentProcessingPurchaseOrder from './drawerContents/PaymentProcessing'
import ReceivedPurchaseOrder from './drawerContents/Received'
import OrderCompletedReview from '../../ui/OrderCompletedReview'
import { PurchaseOrderDrawerContentProps } from '@/shared/types/purchaseOrders'


export default function PurchaseOrderDrawerContent({ view }: PurchaseOrderDrawerContentProps) {
  const { order } = view

  switch (order.status) {
    case 'In Transit':
      return <InTransitPurchaseOrder view={view} />
    case 'Received':
      return <ReceivedPurchaseOrder view={view} />
    case 'Payment Processing':
      return <PaymentProcessingPurchaseOrder view={view} />
    case 'Cancelled':
      return <CancelledPurchaseOrder view={view} />
    case 'Completed':
      return (
        <OrderCompletedReview
          orderId={order.id}
          direction="purchase"
          existingReview={order.review_created}
        />
      )
    default:
      return (
        <strong className="p-4">No content available for this status.</strong>
      )
  }
}
