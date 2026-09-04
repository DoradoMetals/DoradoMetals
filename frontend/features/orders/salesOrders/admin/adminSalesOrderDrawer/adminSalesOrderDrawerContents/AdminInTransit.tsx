import TrackingEvents from '@/features/shipping/ui/TrackingEvents'
import { SalesOrderDrawerContentProps, statusConfig } from '@/features/orders/salesOrders/types'
import { useTracking, useShipmentDisplay, outboundOf } from '@/features/shipping/queries'
import { useOrderShipments } from '@dorado/client'
export default function AdminInTransitSalesOrder({ view }: SalesOrderDrawerContentProps) {
  const { order } = view

  // A CONTAINER for its own parcel (ruling 14). The order document no longer
  // carries a `shipment` slot - shipments are their own read, both directions
  // in one array, filtered on the row's `direction` column. carrier_id is not
  // a column of shipping.shipments at all: the SERVICE knows its carrier, and
  // useShipmentDisplay resolves it off the cached carrier-services list.
  const { data: shipments = [] } = useOrderShipments(order.id)
  const shipment = outboundOf(shipments)
  const { carrier_id } = useShipmentDisplay(shipment)

  const { data: trackingInfo, isLoading } = useTracking({
    shipment_id: shipment?.id ?? '',
    tracking_number: shipment?.tracking_number ?? '',
    carrier_id: carrier_id ?? '',
  })

  return (
    <>
      <TrackingEvents
        isLoading={isLoading}
        trackingInfo={trackingInfo}
        delivery_date={shipment?.delivered_at ?? shipment?.est_delivery ?? undefined}
        shipping_status={shipment?.shipping_status ?? ''}
      />
    </>
  )
}
