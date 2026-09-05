import AdminCancelledPurchaseOrder from './adminPurchaseOrderDrawerContents/AdminCancelled'
import AdminCompletedPurchaseOrder from './adminPurchaseOrderDrawerContents/AdminCompleted'
import AdminInTransitPurchaseOrder from './adminPurchaseOrderDrawerContents/AdminInTransit'
import AdminPaymentProcessingPurchaseOrder from './adminPurchaseOrderDrawerContents/AdminPaymentProcessing'
import AdminReceivedPurchaseOrder from './adminPurchaseOrderDrawerContents/AdminReceived'
import { PurchaseOrderDrawerContentProps } from '@/shared/types/purchaseOrders'

export default function AdminPurchaseOrderDrawerContent({ view }: PurchaseOrderDrawerContentProps) {
  const { order } = view

  switch (order.status) {
    case 'In Transit':
      return <AdminInTransitPurchaseOrder view={view} />
    case 'Received':
      return <AdminReceivedPurchaseOrder view={view} />
    case 'Payment Processing':
      return <AdminPaymentProcessingPurchaseOrder view={view} />
    case 'Cancelled':
      return <AdminCancelledPurchaseOrder view={view} />
    case 'Completed':
      return <AdminCompletedPurchaseOrder view={view} />
    default:
      return <strong className="p-4">No content available for this status.</strong>
  }
}
