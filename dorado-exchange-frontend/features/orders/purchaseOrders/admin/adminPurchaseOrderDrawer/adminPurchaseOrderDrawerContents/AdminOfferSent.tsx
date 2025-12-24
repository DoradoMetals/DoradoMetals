import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import CountdownRing from '@/features/orders/ui/CountdownRing'
import { PurchaseOrderDrawerContentProps, statusConfig } from '@/features/orders/purchaseOrders/types'
import getPurchaseOrderTotal from '@/features/orders/purchaseOrders/utils/purchaseOrderTotal'
import { useMemo } from 'react'
import { useSpotPrices } from '@/features/spots/queries'
import { usePurchaseOrderMetals } from '@/features/orders/purchaseOrders/users/queries'

export default function AdminOfferSentPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const config = statusConfig[order.purchase_order_status]
  const { data: spotPrices = [] } = useSpotPrices()
  const { data: orderSpotPrices = [] } = usePurchaseOrderMetals(order.id)

  const total = useMemo(() => {
    return getPurchaseOrderTotal(order, spotPrices, orderSpotPrices)
  }, [order, spotPrices, orderSpotPrices])
  
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
