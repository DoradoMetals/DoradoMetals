import { statusConfig } from '@/types/purchase-order'
import TrackingEvents from '@/features/shipments/ui/TrackingEvents'
import { SalesOrderDrawerContentProps } from '@/types/sales-orders'
import { useTracking } from '@/features/shipments/queries'

export default function AdminInTransitSalesOrder({ order }: SalesOrderDrawerContentProps) {
  const { data: trackingInfo, isLoading } = useTracking({
    shipment_id: order.shipment.id,
    tracking_number: order.shipment.tracking_number,
    carrier_id: order.shipment.carrier_id,
  })

  const baseBg = statusConfig[order.sales_order_status]?.background_color
  const border = statusConfig[order.sales_order_status]?.border_color

  return (
    <>
      <TrackingEvents
        isLoading={isLoading}
        trackingInfo={trackingInfo}
        background_color={baseBg}
        borderColor={border}
        delivery_date={order.shipment.delivered_at ?? order.shipment.estimated_delivery}
        shipping_status={order.shipment.shipping_status}
      />
    </>
  )
}
