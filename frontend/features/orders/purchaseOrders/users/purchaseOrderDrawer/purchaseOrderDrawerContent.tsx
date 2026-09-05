import CancelledPurchaseOrder from '@/features/orders/purchaseOrders/users/purchaseOrderDrawer/drawerContents/Cancelled'
import InTransitPurchaseOrder from '@/features/orders/purchaseOrders/users/purchaseOrderDrawer/drawerContents/InTransit'
import PaymentProcessingPurchaseOrder from '@/features/orders/purchaseOrders/users/purchaseOrderDrawer/drawerContents/PaymentProcessing'
import ReceivedPurchaseOrder from '@/features/orders/purchaseOrders/users/purchaseOrderDrawer/drawerContents/Received'
import OrderCompletedReview from '@/features/orders/ui/OrderCompletedReview'
import { PurchaseOrderDrawerContentProps } from '@/features/orders/purchaseOrders/types'


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
