import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { Button } from '@/shared/ui/base/button'
import { cn } from '@/shared/utils/cn'
import { PurchaseOrderDrawerContentProps, statusConfig } from '@/features/orders/purchaseOrders/types'
import {
  useTracking,
  useOrderShipments,
  useShipmentDisplay,
  outboundOf,
  returnOf,
} from '@/features/shipping/queries'
import TrackingEvents from '@/features/shipping/ui/TrackingEvents'

export default function AdminCancelledPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  // A CONTAINER for its own parcels (ruling 14). `shipment` and
  // `return_shipment` were two named slots for one table; shipments are one
  // read now, filtered on the row's own `direction` column. carrier_id is not
  // a column of shipping.shipments - the SERVICE knows its carrier - so
  // useShipmentDisplay resolves it off the cached carrier-services list.
  const { data: shipments = [] } = useOrderShipments(order.id)
  const shipment = outboundOf(shipments)
  const returnShipment = returnOf(shipments)
  const { carrier_id: returnCarrierId } = useShipmentDisplay(returnShipment)

  const config = statusConfig[order.status ?? '']

  const { data: trackingInfo, isLoading } = useTracking({
    shipment_id: returnShipment?.id ?? '',
    tracking_number: returnShipment?.tracking_number ?? '',
    carrier_id: returnCarrierId ?? '',
  })

  const handleMarkShippingPaid = () => {}

  return (
    <>
      <div className="flex flex-col w-full h-full">
        {!order.totals?.shipping_paid ? (
          <div className="flex flex-col w-full h-auto on-glass p-4 rounded-lg">
            <div className="flex w-full justify-between items-center mb-1">
              <div className="text-lg text-neutral-800">Customer Payment:</div>
              <div className="text-lg text-neutral-800">
                {order.totals?.shipping_paid ? 'Complete' : 'Incomplete'}
              </div>
            </div>
            <div className="flex w-full justify-between items-center mb-3">
              <div className="text-lg text-neutral-800">Payment Due:</div>
              <div className="text-lg text-neutral-800">
                <PriceNumberFlow
                  value={(shipment?.cost ?? 0) + (returnShipment?.cost ?? 0)}
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
            delivery_date={shipment?.delivered_at ?? shipment?.est_delivery ?? undefined}
            shipping_status={shipment?.shipping_status ?? ''}
          />
        )}
      </div>
    </>
  )
}
