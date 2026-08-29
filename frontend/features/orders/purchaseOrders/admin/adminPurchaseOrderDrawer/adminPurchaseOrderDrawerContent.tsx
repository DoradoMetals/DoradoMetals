import AdminCancelledPurchaseOrder from '@/features/orders/purchaseOrders/admin/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/AdminCancelled'
import AdminCompletedPurchaseOrder from '@/features/orders/purchaseOrders/admin/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/AdminCompleted'
import AdminInTransitPurchaseOrder from '@/features/orders/purchaseOrders/admin/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/AdminInTransit'
import AdminPaymentProcessingPurchaseOrder from '@/features/orders/purchaseOrders/admin/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/AdminPaymentProcessing'
import AdminReceivedPurchaseOrder from '@/features/orders/purchaseOrders/admin/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/AdminReceived'
import { PurchaseOrderDrawerContentProps } from '@/features/orders/purchaseOrders/types'

export default function AdminPurchaseOrderDrawerContent({
  order,
}: PurchaseOrderDrawerContentProps) {
  switch (order.status) {
    case 'In Transit':
      return <AdminInTransitPurchaseOrder order={order} />
    case 'Received':
      return <AdminReceivedPurchaseOrder order={order} />
    case 'Payment Processing':
      return <AdminPaymentProcessingPurchaseOrder order={order} />
    case 'Cancelled':
      return <AdminCancelledPurchaseOrder order={order} />
    case 'Completed':
      return <AdminCompletedPurchaseOrder order={order} />
    default:
      return (
        <strong className="p-4">No content available for this status.</strong>
      )
  }
}
