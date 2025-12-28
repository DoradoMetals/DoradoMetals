import { Button } from '@/shared/ui/base/button'
import { cn } from '@/shared/utils/cn'
import {
  PurchaseOrderDrawerContentProps,
  statusConfig,
} from '@/features/orders/purchaseOrders/types'
import TrackingEvents from '@/features/shipping/ui/TrackingEvents'
import {
  useShippingCancelLabel,
  useShippingCancelPickup,
  useTracking,
} from '@/features/shipping/queries'

export default function AdminInTransitPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const { data: trackingInfo, isLoading } = useTracking({
    shipment_id: order.shipment.id,
    tracking_number: order.shipment.tracking_number,
    carrier_id: order.shipment.carrier_id,
  })

  const color = statusConfig[order.purchase_order_status]?.text_color
  const baseBg = statusConfig[order.purchase_order_status]?.background_color
  const border = statusConfig[order.purchase_order_status]?.border_color

  return (
    <>
      {order.shipment.shipping_status === 'Label Created' ||
      order.shipment.shipping_status === 'Cancelled' ? (
        <div className="flex flex-col w-full gap-5">
          <PreTransit order={order} color={color} />
        </div>
      ) : (
        <TrackingEvents
          isLoading={isLoading}
          trackingInfo={trackingInfo}
          background_color={baseBg}
          borderColor={border}
          delivery_date={order.shipment.delivered_at ?? order.shipment.estimated_delivery}
          shipping_status={order.shipment.shipping_status}
        />
      )}
    </>
  )
}

export function PreTransit({
  order,
  color,
}: {
  order: PurchaseOrderDrawerContentProps['order']
  color?: string
}) {
  const cancelLabel = useShippingCancelLabel()
  const cancelPickup = useShippingCancelPickup()

  return (
    <div className="flex flex-col w-full gap-5">
      <div className="flex w-full justify-between items-center">
        <h3 className="text-base text-neutral-800">Package Not Yet Scanned</h3>
        {order.carrier_pickup?.confirmation_number && order.carrier_pickup?.pickup_requested_at && (
          <Button
            variant="link"
            className={cn('bg-transparent hover:bg-transparent', color)}
            onClick={() => {
              cancelPickup.mutate({
                carrier_id: order.shipment.carrier_id,
                pickup_id: order?.carrier_pickup?.id ?? '',
                confirmation_code: order?.carrier_pickup?.confirmation_number,
              })
            }}
          >
            Cancel Pickup
          </Button>
        )}
      </div>
      <div className="flex w-full justify-between items-center">
        <div className="">Tracking Number:</div>
        <div>{order.shipment.tracking_number}</div>
      </div>
      <div className=""></div>

      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          className="text-destructive bg-transparent border border-destructive hover:text-white hover:bg-destructive"
          disabled={
            !order.shipment.shipping_label ||
            order.shipment.shipping_status === 'Cancelled' ||
            cancelLabel.isPending
          }
          onClick={() =>
            cancelLabel.mutate({
              carrier_id: order.shipment.carrier_id,
              shipment_id: order.shipment.id,
              tracking_number: order.shipment.tracking_number,
            })
          }
        >
          {order.shipment.shipping_status === 'Cancelled'
            ? 'Label Cancelled'
            : cancelLabel.isPending
            ? 'Cancelling'
            : 'Cancel Label'}
        </Button>
      </div>
    </div>
  )
}
