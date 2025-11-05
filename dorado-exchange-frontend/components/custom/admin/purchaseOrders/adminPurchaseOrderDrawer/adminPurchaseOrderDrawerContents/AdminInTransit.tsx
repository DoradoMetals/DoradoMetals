import { Button } from '@/components/ui/button'
import { useTracking } from '@/lib/queries/shipping/useShipments'
import { cn } from '@/lib/utils'
import { PurchaseOrderDrawerContentProps, statusConfig } from '@/types/purchase-order'
import { useDownloadBase64 } from '@/utils/useDownloadLabel'
import { useFormatPurchaseOrderNumber } from '@/utils/formatPurchaseOrderNumber'
import { useCancelFedExLabel, useCancelFedExPickup } from '@/lib/queries/shipping/useFedex'
import TrackingEvents from '@/components/custom/shipments/trackingEvents'

export default function AdminInTransitPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const { data: trackingInfo, isLoading } = useTracking(
    order.shipment.id,
    order.shipment.tracking_number,
    order.shipment.carrier_id
  )

  const color = statusConfig[order.purchase_order_status]?.text_color
  const baseBg = statusConfig[order.purchase_order_status]?.background_color
  const hoverBg = statusConfig[order.purchase_order_status]?.hover_background_color
  const border = statusConfig[order.purchase_order_status]?.border_color

  return (
    <>
      {order.shipment.shipping_status === 'Label Created' ||
      order.shipment.shipping_status === 'Cancelled' ? (
        <div className="flex flex-col w-full gap-5">
          <PreTransit order={order} color={color} border={border} hoverBg={hoverBg} />
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
  border,
  hoverBg,
}: {
  order: PurchaseOrderDrawerContentProps['order']
  color?: string
  border?: string
  hoverBg?: string
}) {
  const { downloadBase64 } = useDownloadBase64()
  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()
  const cancelLabel = useCancelFedExLabel(order.id)
  const cancelPickup = useCancelFedExPickup()

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
                id: order.carrier_pickup?.id!,
                confirmationCode: order.carrier_pickup?.confirmation_number!,
                pickupDate: order.carrier_pickup?.pickup_requested_at!,
                location: order.carrier_pickup?.location!,
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
          className={cn(
            'border transition-colors bg-transparent hover:text-white w-full',
            border,
            hoverBg,
            color
          )}
          disabled={!order.shipment.shipping_label}
          onClick={() => {
            if (!order.shipment.shipping_label) return
            downloadBase64(
              order.shipment.shipping_label,
              `order-${formatPurchaseOrderNumber(order.order_number)}.png`,
              'image/png'
            )
          }}
        >
          Download Label
        </Button>
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
              tracking_number: order.shipment.tracking_number,
              shipment_id: order.shipment.id,
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
