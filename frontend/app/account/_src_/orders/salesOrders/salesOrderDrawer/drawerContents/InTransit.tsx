import TrackingEvents from '@/shared/ui/TrackingEvents'
import { SalesOrderDrawerContentProps } from '@/shared/types/salesOrders'
import { outboundOf, useOrderShipments } from '@dorado/client'

export default function InTransitSalesOrder({ view }: SalesOrderDrawerContentProps) {
  const { order } = view

  // ONE READ, and the parcel arrives with its progress already worked out. The
  // carrier lookup that used to sit here (carrier_id is not a column of
  // shipping.shipments - the SERVICE knows its carrier) is the server's.
  const { data: shipments = [], isLoading } = useOrderShipments(order.id)

  return <TrackingEvents isLoading={isLoading} shipment={outboundOf(shipments)} />
}
