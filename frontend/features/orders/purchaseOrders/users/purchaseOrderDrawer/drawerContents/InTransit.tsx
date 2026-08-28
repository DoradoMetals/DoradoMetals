import { Button } from '@/shared/ui/base/button'
import { cn } from '@/shared/utils/cn'
import { packageOptions } from '@/features/packaging/types'
import { useShipmentPickups } from '@/features/shipping/queries'
import type { Shipment } from '@dorado/contracts'
import { PurchaseOrderDrawerContentProps } from '@/features/orders/purchaseOrders/types'
import { formatPickupDateTime } from '@/shared/utils/formatDates'
import { Car, CheckCheck, PackageOpen, Printer } from 'lucide-react'
import TrackingEvents from '@/features/shipping/ui/TrackingEvents'
import {
  useTracking,
  useOrderShipments,
  useShipmentDisplay,
  outboundOf,
  returnOf,
} from '@/features/shipping/queries'

export default function InTransitPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  // A CONTAINER for its own parcels (ruling 14). `shipment` and
  // `return_shipment` were two named slots for one table; shipments are one
  // read now, filtered on the row's own `direction` column. carrier_id is not
  // a column of shipping.shipments - the SERVICE knows its carrier - so
  // useShipmentDisplay resolves it off the cached carrier-services list.
  const { data: shipments = [] } = useOrderShipments(order.id)
  const shipment = outboundOf(shipments)
  const returnShipment = returnOf(shipments)
  const { carrier_id } = useShipmentDisplay(shipment)

  const { data: trackingInfo, isLoading } = useTracking({
    shipment_id: shipment?.id ?? '',
    tracking_number: shipment?.tracking_number ?? '',
    carrier_id: carrier_id ?? '',
  })

  return (
    <>
      {shipment?.shipping_status === 'Label Created' ? (
        <div className="flex flex-col w-full gap-5">
          <DropoffInstructionsSection shipment={shipment} />
        </div>
      ) : (
        <TrackingEvents
          isLoading={isLoading}
          trackingInfo={trackingInfo}
          delivery_date={shipment?.delivered_at ?? shipment?.est_delivery ?? undefined}
          shipping_status={shipment?.shipping_status ?? ''}
        />
      )}
    </>
  )
}

// A SMALL CONTAINER, one hop from what it renders (ruling 14): it takes the
// parcel as a prop and fetches only the parcel's OWN child - the carrier
// pickup, whose parent is the shipment (shipping.pickups.shipment_id), not
// the order.
export function DropoffInstructionsSection({ shipment }: { shipment?: Shipment }) {
  const { data: pickups = [] } = useShipmentPickups(shipment?.id)
  const carrierPickup = pickups[0] ?? null

  if (shipment?.shipping_status !== 'Label Created') return null

  // The box is named by ID on the row. packageOptions is a client-side list
  // of the same boxes; matching on its label is what the composed wire's
  // joined `package` string allowed, and it is the one lookup here that has
  // no reference read behind it yet - flagged rather than invented.
  const selectedPackage = packageOptions[0]

  const steps = [
    {
      icon: <Printer size={18} className="text-primary" />,
      title: 'Print Packing List and Label',
      description:
        'You will need to include the packing list inside your package. The label will attached to the outside of your package.',
    },
    {
      icon: <PackageOpen size={18} className="text-primary" />,
      title: 'Pack Your Items',
      description: `Pack up your items in a ${
        selectedPackage?.label
      } (${`${selectedPackage?.dimensions.length} × ${selectedPackage?.dimensions.width} × ${selectedPackage?.dimensions.height}`} in). We recommend double
      boxing using generic packaging to prevent theft or
      damage while your shipment is in-transit. `,
    },
    {
      icon: <Car size={18} className="text-primary" />,
      title:
        shipment.pickup_type === 'Carrier Pickup'
          ? 'Wait for Pickup'
          : 'Drop Off Your Package',
      description:
        shipment.pickup_type === 'Carrier Pickup'
          ? `FedEx will pick up your items up around ${formatPickupDateTime(
              carrierPickup?.requested_at ?? undefined
            )}. Please have your shipment packed and ready to go by that time.`
          : 'Take your package to a FedEx or affiliate location of your choosing.',
      action:
        shipment.pickup_type !== 'Carrier Pickup' ? (
          <Button
            variant="link"
            className="h-auto p-0 text-sm font-normal hover:underline text-primary"
          >
            Find Store
          </Button>
        ) : null,
    },
    {
      icon: <CheckCheck size={18} className="text-primary" />,
      title: 'Done!',
      description: `We'll take care of the rest. You will receive an email
      as soon as we get your shipment. As soon as your 
      label is scanned, we'll start updating this page
      with your shipment progress.`,
    },
  ]

  return (
    <div className="flex flex-col w-full gap-5">
      <h3 className="text-sm text-neutral-600 tracking-widest">Shipping Instructions</h3>
      {/* A TIMELINE, NOT PROSE. typography.css gives every ul/ol markers and
          an indent, and exempts structural lists two ways - by role, and by
          LAYOUT INTENT (`ol[class*='flex']` and friends). This is the second
          mechanism, used rather than a `list-none` at the call site, which
          would be the per-call-site override ruling (h) exists to end: the
          list IS a flex column of steps, so saying so is both true and what
          the reset already reads. */}
      <ol className="relative flex flex-col">
        {steps.map((step, index) => (
          <li
            key={index}
            className={cn(
              'relative ml-4 pb-6',
              index === steps.length - 1 ? '' : 'border-l border-border'
            )}
          >
            <div className="absolute -left-[16px] top-0 bg-card rounded-full border border-primary w-8 h-8 flex items-center justify-center">
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
      </div>
    </div>
  )
}
