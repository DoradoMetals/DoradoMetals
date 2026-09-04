import AdminCancelledPurchaseOrder from '@/features/orders/purchaseOrders/admin/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/AdminCancelled'
import AdminCompletedPurchaseOrder from '@/features/orders/purchaseOrders/admin/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/AdminCompleted'
import AdminInTransitPurchaseOrder from '@/features/orders/purchaseOrders/admin/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/AdminInTransit'
import AdminPaymentProcessingPurchaseOrder from '@/features/orders/purchaseOrders/admin/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/AdminPaymentProcessing'
import AdminReceivedPurchaseOrder from '@/features/orders/purchaseOrders/admin/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/AdminReceived'
import { PurchaseOrderDrawerContentProps } from '@/features/orders/purchaseOrders/types'

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
      return (
        <strong className="p-4">No content available for this status.</strong>
      )
  }
}
