import PriceNumberFlow from '@/components/custom/products/PriceNumberFlow'
import { Button } from '@/components/ui/button'
import { useReturnShipmentTracking } from '@/lib/queries/shipping/useShipments'
import { cn } from '@/lib/utils'
import {
  PurchaseOrderDrawerContentProps,
  statusConfig,
  StatusConfigEntry,
} from '@/types/purchase-order'
import { ShipmentTracking } from '@/types/shipping'
import { formatDateWithTimeInParens } from '@/utils/dateFormatting'
import { addDays } from 'date-fns'

export default function AdminCancelledPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const config = statusConfig[order.purchase_order_status]

  const shipment_start = new Date(order.return_shipment.created_at).toISOString().slice(0, 10)
  const shipment_end = addDays(new Date(), 1).toISOString().slice(0, 10)
  const { data: trackingInfo, isLoading } = useReturnShipmentTracking(
    order.return_shipment.id,
    shipment_start,
    shipment_end,
    order.return_shipment.tracking_number
  )

  const handleMarkShippingPaid = () => {
    // console.log('Shipping Paid')
  }

  return (
    <>
      <div className="flex flex-col w-full h-full">
        {!order.shipping_paid ? (
          <div className="flex flex-col w-full h-auto raised-off-screen bg-card p-4 rounded-lg">
            <div className="flex w-full justify-between items-center mb-1">
              <div className="text-lg text-neutral-800">Customer Payment:</div>
              <div className="text-lg text-neutral-800">
                {order.shipping_paid ? 'Complete' : 'Incomplete'}
              </div>
            </div>
            <div className="flex w-full justify-between items-center mb-3">
              <div className="text-lg text-neutral-800">Payment Due:</div>
              <div className="text-lg text-neutral-800">
                <PriceNumberFlow
                  value={order.shipment.shipping_charge + order.return_shipment.shipping_charge}
                />
              </div>
            </div>
            <Button
              variant="link"
              className={cn(config.text_color, 'p-0 text-sm font-normal ml-auto')}
              onClick={() => {
                handleMarkShippingPaid
              }}
            >
              Mark Shipping Paid
            </Button>
          </div>
        ) : (
          <ShipmentTrackingSection
            trackingInfo={trackingInfo}
            config={config}
            delivery_date={order.shipment.delivered_at ?? order.shipment.estimated_delivery}
            shipping_status={order.shipment.shipping_status}
          />
        )}
      </div>
    </>
  )
}

function ShipmentTrackingSection({
  trackingInfo,
  config,
  delivery_date,
  shipping_status,
}: {
  trackingInfo: ShipmentTracking | null | undefined
  config: StatusConfigEntry
  delivery_date?: string
  shipping_status: string
}) {
  if (!trackingInfo) return null

  const scan_events = trackingInfo.scan_events ?? []

  const getMatch = (status: string) =>
    scan_events.find((e) => e.status?.toLowerCase() === status.toLowerCase())

  const pickedUp = getMatch('Picked Up')
  const outForDelivery = getMatch('Out for Delivery')
  const delivered = getMatch('Delivered')

  const inTransits = scan_events.filter((e) => e.status?.toLowerCase() === 'in transit')

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
              step.active ? config.border_color : 'border-muted'
            )}
          >
            <div
              className={cn(
                'absolute -left-[10px] w-5 h-5 rounded-full',
                step.active ? config.background_color : 'bg-neutral-800'
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
