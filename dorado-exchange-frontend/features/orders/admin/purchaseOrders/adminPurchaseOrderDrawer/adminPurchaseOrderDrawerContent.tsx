import AdminAcceptedPurchaseOrder from '@/features/orders/admin/purchaseOrders/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/AdminAccepted'
import AdminCancelledPurchaseOrder from '@/features/orders/admin/purchaseOrders/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/AdminCancelled'
import AdminCompletedPurchaseOrder from '@/features/orders/admin/purchaseOrders/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/AdminCompleted'
import AdminInTransitPurchaseOrder from '@/features/orders/admin/purchaseOrders/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/AdminInTransit'
import AdminOfferSentPurchaseOrder from '@/features/orders/admin/purchaseOrders/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/AdminOfferSent'
import AdminPaymentProcessingPurchaseOrder from '@/features/orders/admin/purchaseOrders/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/AdminPaymentProcessing'
import AdminReceivedPurchaseOrder from '@/features/orders/admin/purchaseOrders/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/AdminReceived'
import AdminRejectedPurchaseOrder from '@/features/orders/admin/purchaseOrders/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/AdminRejected'
import { PurchaseOrderDrawerContentProps } from '@/types/purchase-order'

export default function AdminPurchaseOrderDrawerContent({
  order,
}: PurchaseOrderDrawerContentProps) {
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
    case 'Payment Processing':
      return <AdminPaymentProcessingPurchaseOrder order={order} />
    case 'Cancelled':
      return <AdminCancelledPurchaseOrder order={order} />
    case 'Completed':
      return <AdminCompletedPurchaseOrder order={order} />
    default:
      return (
        <div className="p-4 text-sm text-neutral-800">No content available for this status.</div>
      )
  }
}
