import PriceNumberFlow from '@/components/custom/products/PriceNumberFlow'
import TrackingEvents from '@/components/custom/shipments/trackingEvents'
import { Button } from '@/components/ui/button'
import { useTracking } from '@/lib/queries/shipping/useShipments'
import { cn } from '@/lib/utils'
import { PurchaseOrderDrawerContentProps, statusConfig } from '@/types/purchase-order'

export default function AdminCancelledPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const config = statusConfig[order.purchase_order_status]

  const { data: trackingInfo, isLoading } = useTracking(
    order.return_shipment.id,
    order.return_shipment.tracking_number,
    order.return_shipment.carrier_id,
  )

  const handleMarkShippingPaid = () => {

  }

  return (
    <>
      <div className="flex flex-col w-full h-full">
        {!order.return_shipping_paid ? (
          <div className="flex flex-col w-full h-auto raised-off-screen bg-card p-4 rounded-lg">
            <div className="flex w-full justify-between items-center mb-1">
              <div className="text-lg text-neutral-800">Customer Payment:</div>
              <div className="text-lg text-neutral-800">
                {order.return_shipping_paid ? 'Complete' : 'Incomplete'}
              </div>
            </div>
            <div className="flex w-full justify-between items-center mb-3">
              <div className="text-lg text-neutral-800">Payment Due:</div>
              <div className="text-lg text-neutral-800">
                <PriceNumberFlow
                  value={order.shipment.shipping_charge + order.return_shipment.shipping_charge}
                />
              </div>
            </div>
            <Button
              variant="link"
              className={cn(config.text_color, 'p-0 text-sm font-normal ml-auto')}
              onClick={() => {
                handleMarkShippingPaid
              }}
            >
              Mark Shipping Paid
            </Button>
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
