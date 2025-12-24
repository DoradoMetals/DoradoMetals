import TrackingEvents from '@/features/shipments/ui/TrackingEvents'
import { useTracking } from '@/features/shipments/queries'
import { SalesOrderDrawerContentProps } from '@/features/orders/salesOrders/types'

export default function InTransitSalesOrder({ order }: SalesOrderDrawerContentProps) {
  const { data: trackingInfo, isLoading } = useTracking({
    shipment_id: order.shipment.id,
    tracking_number: order.shipment.tracking_number,
    carrier_id: order.shipment.carrier_id,
  })

  return (
    <>
      <TrackingEvents
        isLoading={isLoading}
        trackingInfo={trackingInfo}
        delivery_date={order.shipment.delivered_at ?? order.shipment.estimated_delivery}
        shipping_status={order.shipment.shipping_status}
        useStatusColor={false}
      />
    </>
  )
}
