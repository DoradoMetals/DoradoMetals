import { Button } from '@/components/ui/button'

import { useAcceptOffer, usePurchaseOrderMetals } from '@/lib/queries/usePurchaseOrders'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import { PurchaseOrderDrawerContentProps, statusConfig } from '@/types/purchase-order'
import { useMemo } from 'react'
import { payoutOptions } from '@/types/payout'
import getPurchaseOrderTotal from '@/utils/purchaseOrderTotal'
import { cn } from '@/lib/utils'
import { useTracking } from '@/lib/queries/shipping/useShipments'
import PriceNumberFlow from '@/components/custom/products/PriceNumberFlow'
import TrackingEvents from '@/components/custom/shipments/trackingEvents'

export default function CancelledPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const { data: spotPrices = [] } = useSpotPrices()
  const { data: orderSpotPrices = [] } = usePurchaseOrderMetals(order.id)

  const { data: trackingInfo, isLoading } = useTracking(
    order.return_shipment.id,
    order.return_shipment.tracking_number,
    order.return_shipment.carrier_id,
  )

  const acceptOffer = useAcceptOffer()

  const config = statusConfig[order.purchase_order_status]

  const payoutMethod = payoutOptions.find((p) => p.method === order.payout?.method)
  const payoutFee = payoutMethod?.cost ?? 0

  const handleAcceptOffer = () => {
    acceptOffer.mutate({
      purchase_order: order,
      order_spots: orderSpotPrices,
      spot_prices: spotPrices,
    })
  }

  const total = useMemo(() => {
    return getPurchaseOrderTotal(order, spotPrices, orderSpotPrices, payoutFee)
  }, [order, spotPrices, orderSpotPrices, payoutFee])

  const handlePayShipping = () => {
  }

  return (
    <>
      <div className="flex flex-col w-full h-full">
        {!order.shipping_paid ? (
          <div className="flex flex-col h-full w-full mb-4 gap-6">
            <div className="flex flex-col w-full">
              <div className="flex flex-col gap-1 text-left text-xl text-neutral-900 mb-4">
                You have cancelled your order.
                <div className="text-sm text-neutral-700">
                  Before we can return your items, we must collect payment for both the original and
                  return shipments.
                </div>
              </div>

              <div className="flex w-full justify-between items-center mb-1">
                <div className="text-lg text-neutral-800">Shipping Charges:</div>
                <div className="text-lg text-neutral-800">
                  <PriceNumberFlow
                    value={order.shipment.shipping_charge + order.return_shipment.shipping_charge}
                  />
                </div>
              </div>
              <Button
                variant="default"
                className={cn(
                  config.background_color,
                  config.hover_background_color,
                  'text-white raised-off-page w-full p-4'
                )}
                onClick={handlePayShipping}
              >
                Pay Shipping Charges
              </Button>
            </div>

            <div className="separator-inset" />

            <div className="flex flex-col w-full">
              <div className="flex flex-col gap-1 text-left text-xl text-neutral-900 mb-4">
                It's not too late!
                <div className="text-sm text-neutral-700">
                  Instead of paying the shipping charges and waiting for your return shipment, you
                  can still accept our last offer.
                </div>
              </div>

              <div className="flex w-full justify-between items-center mb-1">
                <div className="text-lg text-neutral-800">Last Offer:</div>
                <div className="text-lg text-neutral-800">
                  <PriceNumberFlow value={order.total_price ?? total} />
                </div>
              </div>
              <Button
                variant="default"
                className={cn(
                  config.text_color,
                  config.hover_background_color,
                  'hover:text-white raised-off-page w-full p-4 bg-card'
                )}
                onClick={handleAcceptOffer}
                disabled={acceptOffer.isPending}
              >
                {acceptOffer.isPending ? 'Accepting…' : 'Accept Last Offer'}
              </Button>
            </div>
          </div>
        ) : (
          <TrackingEvents
            isLoading={isLoading}
            trackingInfo={trackingInfo}
            background_color={config.background_color}
            borderColor={config.border_color}
            delivery_date={order.shipment.delivered_at ?? order.shipment.estimated_delivery}
            shipping_status={order.shipment.shipping_status}
          />
        )}
      </div>
    </>
  )
}
