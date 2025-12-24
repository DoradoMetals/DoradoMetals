import { Button } from '@/shared/ui/base/button'
import { cn } from '@/shared/utils/cn'
import { packageOptions } from '@/features/packaging/types'
import { PurchaseOrderDrawerContentProps } from '@/features/orders/purchaseOrders/types'
import { formatPickupDateTime } from '@/shared/utils/formatDates'
import { Car, CheckCheck, PackageOpen, Printer } from 'lucide-react'
import TrackingEvents from '@/features/shipments/ui/TrackingEvents'
import { useTracking } from '@/features/shipments/queries'

export default function InTransitPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const { data: trackingInfo, isLoading } = useTracking({
    shipment_id: order.shipment.id,
    tracking_number: order.shipment.tracking_number,
    carrier_id: order.shipment.carrier_id,
  })

  return (
    <>
      {order.shipment.shipping_status === 'Label Created' ? (
        <div className="flex flex-col w-full gap-5">
          <DropoffInstructionsSection order={order} />
        </div>
      ) : (
        <TrackingEvents
          isLoading={isLoading}
          trackingInfo={trackingInfo}
          delivery_date={order.shipment.delivered_at ?? order.shipment.estimated_delivery}
          shipping_status={order.shipment.shipping_status}
        />
      )}
    </>
  )
}

export function DropoffInstructionsSection({
  order,
}: {
  order: PurchaseOrderDrawerContentProps['order']
}) {
  if (order.shipment.shipping_status !== 'Label Created') return null

  const selectedPackage = packageOptions.find((p) => p.label === order.shipment.package)

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
      <ol className="relative">
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
