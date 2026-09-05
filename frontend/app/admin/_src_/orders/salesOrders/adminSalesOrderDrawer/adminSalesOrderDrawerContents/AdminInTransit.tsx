import TrackingEvents from '@/shared/ui/TrackingEvents'
import { SalesOrderDrawerContentProps, statusConfig } from '@/shared/types/salesOrders'
import { outboundOf } from '../../../../shipping/queries'
import { useOrderShipments } from '@dorado/client'
export default function AdminInTransitSalesOrder({ view }: SalesOrderDrawerContentProps) {
  const { order } = view

  // A CONTAINER for its own parcel (ruling 14). The order document no longer
  // carries a `shipment` slot - shipments are their own read, both directions
  // in one array, filtered on the row's `direction` column. The view already
  // carries the service's carrier and the progress timeline, so no client-side
  // join is left to do.
  const { data: shipments = [], isLoading } = useOrderShipments(order.id)
  const shipment = outboundOf(shipments)

  return (
    <>
      <TrackingEvents isLoading={isLoading} shipment={shipment} />
    </>
  )
}
