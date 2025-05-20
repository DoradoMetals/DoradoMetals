import { PurchaseOrderDrawerContentProps } from '@/types/purchase-order'
import InTransitPurchaseOrder from './drawerContents/InTransit'
import ReceivedPurchaseOrder from './drawerContents/Received'
import OfferSentPurchaseOrder from './drawerContents/OfferSent'
import AcceptedPurchaseOrder from './drawerContents/Accepted'
import RejectedPurchaseOrder from './drawerContents/Rejected'
import PaymentProcessingPurchaseOrder from './drawerContents/PaymentProcessing'
import CancelledPurchaseOrder from './drawerContents/Cancelled'
import CompletedPurchaseOrder from './drawerContents/Completed'

export default function PurchaseOrderDrawerContent({ order }: PurchaseOrderDrawerContentProps) {
  switch (order.purchase_order_status) {
    case 'In Transit':
      return <InTransitPurchaseOrder order={order} />
    case 'Received':
      return <ReceivedPurchaseOrder order={order} />
    case 'Offer Sent':
      return <OfferSentPurchaseOrder order={order} />
    case 'Accepted':
      return <AcceptedPurchaseOrder order={order} />
    case 'Rejected':
      return <RejectedPurchaseOrder order={order} />
    case 'Payment Processing':
      return <PaymentProcessingPurchaseOrder order={order} />
    case 'Cancelled':
      return <CancelledPurchaseOrder order={order} />
    case 'Completed':
      return <CompletedPurchaseOrder order={order} />
    default:
      return (
        <div className="p-4 text-sm text-neutral-800">No content available for this status.</div>
      )
  }
}
