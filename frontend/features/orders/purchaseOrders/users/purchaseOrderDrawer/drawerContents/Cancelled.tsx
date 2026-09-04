import { Button } from '@dorado/components'

import { PurchaseOrderDrawerContentProps } from '@/features/orders/purchaseOrders/types'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import TrackingEvents from '@/features/shipping/ui/TrackingEvents'
import { useTracking, useShipmentDisplay, outboundOf, returnOf } from '@/features/shipping/queries'
import { useOrderShipments } from '@dorado/client'
export default function CancelledPurchaseOrder({ view }: PurchaseOrderDrawerContentProps) {
  const { order } = view

  // A CONTAINER for its own parcels (ruling 14). `shipment` and
  // `return_shipment` were two named slots for one table; shipments are one
  // read now, filtered on the row's own `direction` column. carrier_id is not
  // a column of shipping.shipments - the SERVICE knows its carrier - so
  // useShipmentDisplay resolves it off the cached carrier-services list.
  const { data: shipments = [] } = useOrderShipments(order.id)
  const shipment = outboundOf(shipments)
  const returnShipment = returnOf(shipments)
  const { carrier_id: returnCarrierId } = useShipmentDisplay(returnShipment)

  const { data: trackingInfo, isLoading } = useTracking({
    shipment_id: returnShipment?.id ?? '',
    tracking_number: returnShipment?.tracking_number ?? '',
    carrier_id: returnCarrierId ?? '',
  })


  const handlePayShipping = () => {}

  return (
    <>
      <div className="flex flex-col w-full h-full">
        {!view.totals?.shipping_paid ? (
          <div className="flex flex-col h-full w-full mb-4 gap-6">
            <div className="flex flex-col w-full">
              <div className="flex w-full justify-between items-center mb-1">
                <strong className="stat-sm">Shipping Charges:</strong>
                <strong className="stat-sm">
                  <PriceNumberFlow
                    value={(shipment?.cost ?? 0) + (returnShipment?.cost ?? 0)}
                  />
                </strong>
              </div>
              <Button
                className="w-full p-4"
                onClick={handlePayShipping}
              >
                Pay Shipping Charges
              </Button>
            </div>

          </div>
        ) : (
          <TrackingEvents
            isLoading={isLoading}
            trackingInfo={trackingInfo}
            delivery_date={shipment?.delivered_at ?? shipment?.est_delivery ?? undefined}
            shipping_status={shipment?.shipping_status ?? ''}
          />
        )}
      </div>
    </>
  )
}
