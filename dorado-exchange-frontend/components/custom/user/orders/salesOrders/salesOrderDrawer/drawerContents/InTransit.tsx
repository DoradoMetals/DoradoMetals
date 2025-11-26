import TrackingEvents from '@/components/custom/shipments/trackingEvents'
import { SalesOrderDrawerContentProps } from '@/types/sales-orders'
import { useTracking } from '@/lib/queries/shipping/useShipments'

export default function InTransitSalesOrder({ order }: SalesOrderDrawerContentProps) {
  const { data: trackingInfo, isLoading } = useTracking(
    order.shipment.id,
    order.shipment.tracking_number,
    order.shipment.carrier_id
  )

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
