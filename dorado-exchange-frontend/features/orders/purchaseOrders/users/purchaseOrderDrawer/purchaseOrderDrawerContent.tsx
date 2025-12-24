import AcceptedPurchaseOrder from '@/features/orders/purchaseOrders/users/purchaseOrderDrawer/drawerContents/Accepted'
import CancelledPurchaseOrder from '@/features/orders/purchaseOrders/users/purchaseOrderDrawer/drawerContents/Cancelled'
import CompletedPurchaseOrder from '@/features/orders/purchaseOrders/users/purchaseOrderDrawer/drawerContents/Completed'
import InTransitPurchaseOrder from '@/features/orders/purchaseOrders/users/purchaseOrderDrawer/drawerContents/InTransit'
import OfferSentPurchaseOrder from '@/features/orders/purchaseOrders/users/purchaseOrderDrawer/drawerContents/OfferSent'
import PaymentProcessingPurchaseOrder from '@/features/orders/purchaseOrders/users/purchaseOrderDrawer/drawerContents/PaymentProcessing'
import ReceivedPurchaseOrder from '@/features/orders/purchaseOrders/users/purchaseOrderDrawer/drawerContents/Received'
import RejectedPurchaseOrder from '@/features/orders/purchaseOrders/users/purchaseOrderDrawer/drawerContents/Rejected'
import { PurchaseOrderDrawerContentProps } from '@/types/purchase-order'


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
