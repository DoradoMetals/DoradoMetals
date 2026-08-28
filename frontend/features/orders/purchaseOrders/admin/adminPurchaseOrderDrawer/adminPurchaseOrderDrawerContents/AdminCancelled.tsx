import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { Button } from '@/shared/ui/base/button'
import { cn } from '@/shared/utils/cn'
import { PurchaseOrderDrawerContentProps, statusConfig } from '@/features/orders/purchaseOrders/types'
import { useTracking } from '@/features/shipping/queries'
import TrackingEvents from '@/features/shipping/ui/TrackingEvents'

export default function AdminCancelledPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const config = statusConfig[order.status ?? '']

  const { data: trackingInfo, isLoading } = useTracking({
    shipment_id: order.return_shipment.id ?? '',
    tracking_number: order.return_shipment.tracking_number ?? '',
    carrier_id: order.return_shipment.carrier_id ?? '',
  })

  const handleMarkShippingPaid = () => {}

  return (
    <>
      <div className="flex flex-col w-full h-full">
        {!order.shipping_paid ? (
          <div className="flex flex-col w-full h-auto on-glass p-4 rounded-lg">
            <div className="flex w-full justify-between items-center mb-1">
              <div className="text-lg text-neutral-800">Customer Payment:</div>
              <div className="text-lg text-neutral-800">
                {order.shipping_paid ? 'Complete' : 'Incomplete'}
              </div>
            </div>
            <div className="flex w-full justify-between items-center mb-3">
              <div className="text-lg text-neutral-800">Payment Due:</div>
              <div className="text-lg text-neutral-800">
                <PriceNumberFlow
                  value={(order.shipment.shipping_charge ?? 0) + (order.return_shipment.shipping_charge ?? 0)}
                />
              </div>
            </div>
            <Button
              variant="link"
              className={cn('text-primary', 'p-0 text-sm font-normal ml-auto')}
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
            background_color={'bg-primary'}
            borderColor={'border-primary'}
            delivery_date={order.shipment.delivered_at ?? order.shipment.estimated_delivery ?? undefined}
            shipping_status={order.shipment.shipping_status ?? ''}
          />
        )}
      </div>
    </>
  )
}
