import { Button } from '@/components/ui/button'
import { useShipmentTracking } from '@/lib/queries/shipping/useShipments'
import { cn } from '@/lib/utils'
import { packageOptions } from '@/types/packaging'
import { PurchaseOrderDrawerContentProps, statusConfig } from '@/types/purchase-order'
import { formatDateWithTimeInParens, formatPickupDateTime } from '@/utils/dateFormatting'
import { addDays } from 'date-fns'
import {
  Car,
  CheckCheck,
  PackageOpen,
  Printer,
} from 'lucide-react'
import { ShipmentTracking } from '@/types/shipping'
import { useDownloadBase64 } from '@/utils/useDownloadLabel'
import { useFormatPurchaseOrderNumber } from '@/utils/formatPurchaseOrderNumber'

export default function InTransitPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
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
          <DropoffInstructionsSection
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

export function DropoffInstructionsSection({
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

  const selectedPackage = packageOptions[order.shipment.package]
  const { downloadBase64 } = useDownloadBase64()
  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()

  const steps = [
    {
      icon: <Printer size={18} className={cn(color)} />,
      title: 'Print Packing List and Label',
      description:
        'You will need to include the packing list inside your package. The label will attached to the outside of your package.',
    },
    {
      icon: <PackageOpen size={18} className={cn(color)} />,
      title: 'Pack Your Items',
      description: `Pack up your items in a ${
        selectedPackage.label
      } (${`${selectedPackage.dimensions.length} × ${selectedPackage.dimensions.width} × ${selectedPackage.dimensions.height}`} in). We recommend double
      boxing using generic packaging to prevent theft or
      damage while your shipment is in-transit. `,
    },
    {
      icon: <Car size={18} className={cn(color)} />,
      title:
        order.shipment.pickup_type === 'Carrier Pickup'
          ? 'Wait for Pickup'
          : 'Drop Off Your Package',
      description:
        order.shipment.pickup_type === 'Carrier Pickup'
          ? `FedEx will pick up your items up around ${formatPickupDateTime(
              order.carrier_pickup?.pickup_requested_at
            )}. Please have your shipment packed and ready to go by that time.`
          : 'Take your package to a FedEx or affiliate location of your choosing.',
      action:
        order.shipment.pickup_type !== 'Carrier Pickup' ? (
          <Button
            variant="link"
            className={cn('h-auto p-0 text-sm font-normal hover:underline', color)}
          >
            Find Store
          </Button>
        ) : null,
    },
    {
      icon: <CheckCheck size={18} className={cn(color)} />,
      title: 'Done!',
      description: `We’ll take care of the rest. You will receive an email
      as soon as we get your shipment. As soon as your 
      label is scanned, we’ll start updating this page
      with your shipment progress.`,
    },
  ]

  return (
    <div className="flex flex-col w-full gap-5">
      <h3 className="text-sm text-neutral-600 tracking-widest">Shipping Instructions</h3>
      <ol className="relative">
        {steps.map((step, index) => (
          <li
            key={index}
            className={cn(
              'relative ml-4 pb-6',
              index === steps.length - 1 ? '' : 'border-l border-border'
            )}
          >
            <div
              className={cn(
                'absolute -left-[16px] top-0 bg-card rounded-full border w-8 h-8 flex items-center justify-center',
                border
              )}
            >
              {step.icon}
            </div>
            <div className="pl-6">
              <h3 className="text-xl text-neutral-800">{step.title}</h3>
              <p className="text-xs lg:text-sm text-neutral-600">{step.description}</p>
              {step.action && <div className="mt-1">{step.action}</div>}
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-1">
        <div className="flex mr-auto text-xs lg:text-sm text-neutral-600">
          Please call us if you need to make shipping changes.
        </div>
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
      </div>
    </div>
  )
}
