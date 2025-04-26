import AdminInTransitPurchaseOrder from './adminPurchaseOrderDrawerContents/AdminInTransit'
import AdminUnsettledPurchaseOrder from './adminPurchaseOrderDrawerContents/AdminUnsettled'
import AdminFilledPurchaseOrder from './adminPurchaseOrderDrawerContents/AdminFilled'
import AdminAcceptedPurchaseOrder from './adminPurchaseOrderDrawerContents/AdminAccepted'
import AdminRejectedPurchaseOrder from './adminPurchaseOrderDrawerContents/AdminRejected'
import AdminSettledPurchaseOrder from './adminPurchaseOrderDrawerContents/AdminSettled'
import AdminCancelledPurchaseOrder from './adminPurchaseOrderDrawerContents/AdminCancelled'
import AdminCompletedPurchaseOrder from './adminPurchaseOrderDrawerContents/AdminCompleted'
import { PurchaseOrderDrawerContentProps } from '@/types/purchase-order'

export default function AdminPurchaseOrderDrawerContent({ order }: PurchaseOrderDrawerContentProps) {
  switch (order.purchase_order_status) {
    case 'In Transit':
      return <AdminInTransitPurchaseOrder order={order} />
    case 'Unsettled':
      return <AdminUnsettledPurchaseOrder order={order} />
    case 'Filled':
      return <AdminFilledPurchaseOrder order={order} />
    case 'Accepted':
      return <AdminAcceptedPurchaseOrder order={order} />
    case 'Rejected':
      return <AdminRejectedPurchaseOrder order={order} />
    case 'Settled':
      return <AdminSettledPurchaseOrder order={order} />
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
