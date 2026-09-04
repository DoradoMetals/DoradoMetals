import { Separator } from '@/shared/ui/base/separator'
import { useState } from 'react'
import { cn } from '@/shared/utils/cn'
import { SalesOrderDrawerContentProps, statusConfig } from '@/features/orders/salesOrders/types'
import { Button } from '@dorado/components'
import { FloatingLabelInput } from '@/shared/ui/inputs/FloatingLabelInput'
import { RadioGroup } from '@/shared/ui/RadioGroup'
import Image from 'next/image'
import { useAdminSuppliers } from '@/features/products/queries'
import { usePatchShipment, useShipmentDisplay, outboundOf } from '@/features/shipping/queries'
import { useRefinerOrder } from '@/features/refiners/queries'
import { Supplier } from '@/features/products/types'
import { useCarriers } from '@/features/carriers/queries'
import { Carrier } from '@/features/carriers/types'
import { useSendToRefiner } from '@dorado/client'
export default function AdminPreparingSalesOrder({ view }: SalesOrderDrawerContentProps) {
  const { order } = view

  const { data: suppliers = [] } = useAdminSuppliers()
  // WHICH REFINERY HAS THE METAL IS THE ENGAGEMENT'S (ruling 6): the composed
  // wire aliased refiners.orders.refiner_id onto the order as supplier_id, and
  // orders.orders.refinery_id was dropped in 094.
  const { data: engagement } = useRefinerOrder(order.id)
  const shipment = outboundOf(view.shipments)
  const { carrier_id: shipmentCarrierId } = useShipmentDisplay(shipment)
  const { data: carriers = [] } = useCarriers()

  // Tracking writes to the SHIPMENT resource; sending to the refiner is its
  // own action route, not a flag in the order's PATCH.
  const updateTracking = usePatchShipment()
  const sendOrder = useSendToRefiner()

  // WHAT IS SELECTED IS DERIVED, NOT SYNCED. Two useEffects used to copy the
  // server's answers into state once the reads landed - so the screen held a
  // stale duplicate of a row it was already looking at, and rendered once with
  // nothing chosen before the copy ran. The admin's own pick wins; absent one,
  // the stored value IS the selection.
  const [pickedSupplier, setPickedSupplier] = useState<string | null>(null)
  const [pickedCarrier, setPickedCarrier] = useState<string | null>(null)
  const [trackingNumber, setTrackingNumber] = useState('')

  const supplierId = pickedSupplier ?? engagement?.refiner_id ?? ''
  const carrierId = pickedCarrier ?? shipmentCarrierId ?? ''
  const selectedSupplier: Supplier | null = suppliers.find((s) => s.id === supplierId) ?? null
  const selectedCarrier: Carrier | null = carriers.find((c) => c.id === carrierId) ?? null

  return (
    <div className="flex flex-col w-full gap-5">
      <p>
        Order has been paid and is ready to be sent to a supplier. Please select the supplier to
        fill this order.
      </p>
      {suppliers && (
        <RadioGroup
          value={supplierId}
          onValueChange={setPickedSupplier}
          options={suppliers}
          getValue={(s) => s.id}
          isOptionDisabled={(s) => !s.organization.enabled}
          variant="tile"
          className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2"
        >
          {(s) => (
            <>
              <div className="relative flex h-20 w-full items-center justify-center">
                <Image
                  src={s.logo ?? ''}
                  fill
                  alt={`${s.organization.name ?? ''} logo`}
                  className="object-contain p-1"
                />
              </div>
              <strong>{s.organization.name}</strong>
            </>
          )}
        </RadioGroup>
      )}

      {/* The className used to read
            cn('p-4 w-full', !selectedSupplier || (sendOrder.isPending && 'opacity-30'))
          which is a `||` between a boolean and a string: when no supplier is
          picked the expression is literally `true` and `cn(true)` contributes
          NOTHING, so the dimming it was written for never applied in the state
          it was written for. It did not matter, because the button already
          carries a correct `disabled` and Button's base handles
          `disabled:opacity-50` - which is the point. `p-4` went too: it
          duplicated the default size's `px-4` and set a vertical padding a
          fixed-height button ignores. */}
      <Button
        className="w-full"
        onClick={() => {
          // The refiner's copy prints the order's own frozen spots, resolved
          // SERVER-side - the browser no longer reads them back and posts them.
          sendOrder.mutate({ id: order.id, refiner_id: selectedSupplier?.id ?? '' })
        }}
        disabled={!selectedSupplier || sendOrder.isPending || !view.actions.send_to_refiner}
      >
        {sendOrder.isPending
          ? `Sending to ${selectedSupplier?.organization.name}...`
          : order.order_sent
          ? `Order sent to ${selectedSupplier?.organization.name}`
          : selectedSupplier
          ? `Send Order to ${selectedSupplier?.organization.name}`
          : 'Select Supplier'}
      </Button>

      <Separator />

      {carriers && (
        <RadioGroup
          value={carrierId}
          onValueChange={setPickedCarrier}
          options={carriers}
          getValue={(c) => c.id}
          isOptionDisabled={(c) => !c.organization.enabled}
          disabled={!order.order_sent}
          variant="tile"
          className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2"
        >
          {(c) => (
            <>
              <div className="relative flex h-20 w-full items-center justify-center">
                <Image
                  src={c.logo ?? ''}
                  fill
                  alt={`${c.organization.name ?? ''} logo`}
                  className="object-contain p-1"
                />
              </div>
              <strong>{c.organization.name}</strong>
            </>
          )}
        </RadioGroup>
      )}

      <FloatingLabelInput
        type="text"
        className="min-w-48"
        label="Tracking Number"
        value={trackingNumber}
        disabled={!selectedCarrier || updateTracking.isPending}
        onChange={(e) => setTrackingNumber(e.target.value)}
      />

      <Button
        className="w-full"
        onClick={() => {
          if (!shipment?.id) return
          updateTracking.mutate({
            shipment_id: shipment.id,
            order_id: order.id,
            patch: {
              tracking_number: trackingNumber,
              carrier_id: selectedCarrier?.id ?? '',
            },
          })
        }}
        disabled={!selectedCarrier || updateTracking.isPending || trackingNumber === ''}
      >
        {updateTracking.isPending
          ? `Updating tracking for ${selectedCarrier?.organization.name}...`
          : trackingNumber === ''
          ? `Enter tracking for ${selectedCarrier?.organization.name}`
          : selectedCarrier
          ? order.tracking_updated
            ? `Resend tracking for ${selectedCarrier?.organization.name}`
            : `Update tracking for ${selectedCarrier?.organization.name}`
          : 'Select Carrier'}
      </Button>
    </div>
  )
}
