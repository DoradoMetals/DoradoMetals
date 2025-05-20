import PriceNumberFlow from '@/components/custom/products/PriceNumberFlow'
import CountdownRing from '@/components/ui/countdown-ring'
import { usePurchaseOrderMetals } from '@/lib/queries/usePurchaseOrders'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import { payoutOptions } from '@/types/payout'
import { PurchaseOrderDrawerContentProps, statusConfig } from '@/types/purchase-order'
import getPurchaseOrderTotal from '@/utils/purchaseOrderTotal'
import { useMemo } from 'react'

export default function AdminOfferSentPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const config = statusConfig[order.purchase_order_status]
  const { data: spotPrices = [] } = useSpotPrices()
  const { data: orderSpotPrices = [] } = usePurchaseOrderMetals(order.id)
  const payoutMethod = payoutOptions.find((p) => p.method === order.payout?.method)
  const payoutFee = payoutMethod?.cost ?? 0

  const total = useMemo(() => {
    return getPurchaseOrderTotal(order, spotPrices, orderSpotPrices, payoutFee)
  }, [order, spotPrices, orderSpotPrices, payoutFee])
  
  return (
    <>
      <div className="flex flex-col h-full w-full gap-5 ">
        <div className="flex w-full justify-between items-center text-lg text-neutral-800">
          {order.spots_locked ? 'Spots Locked' : 'Spots Unlocked'}
          <PriceNumberFlow value={order.total_price ?? total} />
        </div>
        <div className="flex h-full w-full items-center justify-center">
          <CountdownRing
            sentAt={order.offer_sent_at!}
            expiresAt={order.offer_expires_at!}
            fillColor={config.stroke_color}
          />
        </div>
      </div>
    </>
  )
}
