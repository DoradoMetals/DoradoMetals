import AdminInTransitPurchaseOrder from './adminPurchaseOrderDrawerContents/AdminInTransit'
import AdminReceivedPurchaseOrder from './adminPurchaseOrderDrawerContents/AdminReceived'
import AdminOfferSentPurchaseOrder from './adminPurchaseOrderDrawerContents/AdminOfferSent'
import AdminAcceptedPurchaseOrder from './adminPurchaseOrderDrawerContents/AdminAccepted'
import AdminRejectedPurchaseOrder from './adminPurchaseOrderDrawerContents/AdminRejected'
import AdminPaidPurchaseOrder from './adminPurchaseOrderDrawerContents/AdminPaid'
import AdminCancelledPurchaseOrder from './adminPurchaseOrderDrawerContents/AdminCancelled'
import AdminCompletedPurchaseOrder from './adminPurchaseOrderDrawerContents/AdminCompleted'
import { PurchaseOrderDrawerContentProps } from '@/types/purchase-order'

export default function AdminPurchaseOrderDrawerContent({ order }: PurchaseOrderDrawerContentProps) {
  switch (order.purchase_order_status) {
    case 'In Transit':
      return <AdminInTransitPurchaseOrder order={order} />
    case 'Received':
      return <AdminReceivedPurchaseOrder order={order} />
    case 'Offer Sent':
      return <AdminOfferSentPurchaseOrder order={order} />
    case 'Accepted':
      return <AdminAcceptedPurchaseOrder order={order} />
    case 'Rejected':
      return <AdminRejectedPurchaseOrder order={order} />
    case 'Paid':
      return <AdminPaidPurchaseOrder order={order} />
    case 'Cancelled':
      return <AdminCancelledPurchaseOrder order={order} />
    case 'Completed':
      return <AdminCompletedPurchaseOrder order={order} />
    default:
      return (
        <div className="p-4 text-sm text-neutral-800">
          No content available for this status.
        </div>
      )
  }
}
