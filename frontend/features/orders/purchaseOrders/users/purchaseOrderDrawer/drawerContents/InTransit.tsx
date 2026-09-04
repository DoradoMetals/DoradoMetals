import { Button } from '@dorado/components'
import { Car, CheckCheck, PackageOpen, Printer } from '@dorado/icons'
import { cn } from '@/shared/utils/cn'
import type { ShipmentView } from '@dorado/contracts'
import { PurchaseOrderDrawerContentProps } from '@/features/orders/purchaseOrders/types'
import { formatPickupDateTime } from '@/shared/utils/formatDates'
import TrackingEvents from '@/features/shipping/ui/TrackingEvents'
import { outboundOf, useOrderShipments } from '@dorado/client'

export default function InTransitPurchaseOrder({ view }: PurchaseOrderDrawerContentProps) {
  const { order } = view

  // ONE READ (ruling 14). `shipment` and `return_shipment` were two named slots
  // for one table; parcels are one read, filtered on the row's own `direction`.
  // The parcel arrives COMPOSED - its service, its box, its carrier booking,
  // its progress timeline and what may be done to it - so nothing here joins a
  // cached reference list or decides which panel is earned.
  const { data: shipments = [], isLoading } = useOrderShipments(order.id)
  const shipment = outboundOf(shipments)

  return shipment?.actions.show_instructions ? (
    <div className="flex flex-col w-full gap-5">
      <DropoffInstructionsSection shipment={shipment} />
    </div>
  ) : (
    <TrackingEvents isLoading={isLoading} shipment={shipment} />
  )
}

// A SMALL CONTAINER, one hop from what it renders (ruling 14): it takes the
// composed parcel as a prop and fetches nothing. The box and the courier
// booking used to be two more reads and two more `find`s against cached
// reference lists; they are members of the parcel now.
export function DropoffInstructionsSection({ shipment }: { shipment: ShipmentView }) {
  const box = shipment.package
  const dimensions = box ? `${box.length} × ${box.width} × ${box.height} in` : null
  const isCarrierPickup = shipment.shipment.pickup_type === 'Carrier Pickup'

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
      description: `Pack up your items in a ${box?.label ?? 'box'}${
        dimensions ? ` (${dimensions})` : ''
      }. We recommend double boxing using generic packaging to prevent theft or
      damage while your shipment is in-transit.`,
    },
    {
      icon: <Car size={18} className="text-primary" />,
      title: isCarrierPickup ? 'Wait for Pickup' : 'Drop Off Your Package',
      description: isCarrierPickup
        ? `FedEx will pick up your items up around ${formatPickupDateTime(
            shipment.handoff_at ?? undefined
          )}. Please have your shipment packed and ready to go by that time.`
        : 'Take your package to a FedEx or affiliate location of your choosing.',
      action: isCarrierPickup ? null : (
        <Button variant="tertiary" className="h-auto p-0">
          Find Store
        </Button>
      ),
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
      <h2 className="eyebrow">Shipping Instructions</h2>
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
              <h3>{step.title}</h3>
              <p>{step.description}</p>
              {step.action && <div className="mt-1">{step.action}</div>}
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-1">
        <small className="flex mr-auto">
          Please call us if you need to make shipping changes.
        </small>
      </div>
    </div>
  )
}
