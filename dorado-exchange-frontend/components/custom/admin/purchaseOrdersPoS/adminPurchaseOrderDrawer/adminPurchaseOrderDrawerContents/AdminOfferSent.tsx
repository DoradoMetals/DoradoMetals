import CountdownRing from '@/components/ui/countdown-ring'
import { PurchaseOrderDrawerContentProps, statusConfig } from '@/types/purchase-order'

export default function AdminOfferSentPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const config = statusConfig[order.purchase_order_status]

  return (
    <>
      <div className="p-4">
        <CountdownRing sentAt={order.offer_sent_at!} expiresAt={order.offer_expires_at!} fillColor={config.stroke_color}/>
      </div>
    </>
  )
}
