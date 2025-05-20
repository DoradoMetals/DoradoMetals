import { Button } from '@/components/ui/button'
import { useShipmentTracking } from '@/lib/queries/shipping/useShipments'
import { cn } from '@/lib/utils'
import { PurchaseOrderDrawerContentProps, statusConfig } from '@/types/purchase-order'
import { formatDateWithTimeInParens } from '@/utils/dateFormatting'
import { addDays } from 'date-fns'
import { ShipmentTracking } from '@/types/shipping'
import { useDownloadBase64 } from '@/utils/useDownloadLabel'
import { useFormatPurchaseOrderNumber } from '@/utils/formatPurchaseOrderNumber'
import { useCancelFedExLabel, useCancelFedExPickup } from '@/lib/queries/shipping/useFedex'

export default function AdminInTransitPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const shipment_start = new Date(order.shipment.created_at).toISOString().slice(0, 10)
  const shipment_end = addDays(new Date(), 1).toISOString().slice(0, 10)
  const { data: trackingInfo, isLoading } = useShipmentTracking(
    order.shipment.id,
    shipment_start,
    shipment_end,
    order.shipment.tracking_number
  )

  const color = statusConfig[order.purchase_order_status]?.text_color
  const baseBg = statusConfig[order.purchase_order_status]?.background_color
  const hoverBg = statusConfig[order.purchase_order_status]?.hover_background_color
  const border = statusConfig[order.purchase_order_status]?.border_color

  return (
    <>
      {order.shipment.shipping_status === 'Waiting for Pickup' ||
      order.shipment.shipping_status === 'Waiting for Dropoff' ? (
        <div className="flex flex-col w-full gap-5">
          <PreTransit
            order={order}
            color={color}
            border={border}
            background={baseBg}
            hoverBg={hoverBg}
          />
        </div>
      ) : (
        <ShipmentTrackingSection
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

function ShipmentTrackingSection({
  trackingInfo,
  background_color,
  borderColor,
  delivery_date,
  shipping_status,
}: {
  trackingInfo: ShipmentTracking | null | undefined
  background_color?: string
  borderColor?: string
  delivery_date?: string
  shipping_status: string
}) {
  if (!trackingInfo) return null

  const scan_events = trackingInfo.scan_events ?? []

  const getMatch = (status: string) =>
    scan_events.find((e) => e.status.toLowerCase() === status.toLowerCase())

  const pickedUp = getMatch('Picked Up')
  const outForDelivery = getMatch('Out for Delivery')
  const delivered = getMatch('Delivered')

  const inTransits = scan_events.filter((e) => e.status.toLowerCase() === 'in transit')

  const steps = [
    {
      key: 'Picked Up',
      location: pickedUp?.location,
      date: pickedUp?.scan_time ? formatDateWithTimeInParens(pickedUp.scan_time) : null,
      active: !!pickedUp,
    },
    ...inTransits.map((e, i) => ({
      key: 'In Transit',
      location: e.location,
      date: e.scan_time ? formatDateWithTimeInParens(e.scan_time) : null,
      active: true,
      id: `in-transit-${i}`,
    })),
    {
      key: 'Out for Delivery',
      location: outForDelivery?.location,
      date: outForDelivery?.scan_time ? formatDateWithTimeInParens(outForDelivery.scan_time) : null,
      active: !!outForDelivery,
    },
    {
      key: 'Delivered',
      location: delivered?.location,
      date: delivered?.scan_time ? formatDateWithTimeInParens(delivered.scan_time) : null,
      active: !!delivered,
    },
  ]

  return (
    <div className="flex flex-col gap-5 w-full">
      <div className="flex">
        <span className="text-sm text-neutral-700 ml-auto">
          {delivery_date
            ? `${
                shipping_status === 'Delivered' ? 'Delivered' : 'ETA'
              } - ${formatDateWithTimeInParens(delivery_date)}`
            : 'ETA - TBD'}
        </span>
      </div>

      <h3 className="text-sm text-neutral-600 tracking-widest">Delivery Tracking</h3>

      <ol className="relative ml-4">
        {steps.map((step, index) => (
          <li
            key={index}
            className={cn(
              'relative pl-6 pb-6 flex justify-between items-start',
              index < steps.length - 1 && 'border-l',
              step.active ? borderColor : 'border-muted'
            )}
          >
            <div
              className={cn(
                'absolute -left-[10px] w-5 h-5 rounded-full',
                step.active ? background_color : 'bg-neutral-800'
              )}
            />

            <div>
              <p className="text-sm text-neutral-600">{step.key}</p>
              {step.location && <p className="text-lg text-neutral-800">{step.location}</p>}
            </div>

            <div className="ml-auto text-sm text-neutral-500">{step.date ?? ''}</div>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function PreTransit({
  order,
  color,
  border,
  background,
  hoverBg,
}: {
  order: PurchaseOrderDrawerContentProps['order']
  color?: string
  border?: string
  background?: string
  hoverBg?: string
}) {
  if (
    order.shipment.shipping_status !== 'Waiting for Pickup' &&
    order.shipment.shipping_status !== 'Waiting for Dropoff'
  )
    return null

  const { downloadBase64 } = useDownloadBase64()
  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()
  const cancelLabel = useCancelFedExLabel()
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
          disabled={!order.shipment.shipping_label}
          onClick={() =>
            cancelLabel.mutate({
              tracking_number: order.shipment.tracking_number,
              shipment_id: order.shipment.id,
            })
          }
        >
          Cancel Label
        </Button>
      </div>
    </div>
  )
}
