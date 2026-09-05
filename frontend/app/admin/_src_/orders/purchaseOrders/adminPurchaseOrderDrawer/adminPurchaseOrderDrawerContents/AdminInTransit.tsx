import { Button } from '@dorado/components'
import { cn } from '@/shared/utils/cn'
import {
  PurchaseOrderDrawerContentProps,
  statusConfig,
} from '@/shared/types/purchaseOrders'
import TrackingEvents from '@/shared/ui/TrackingEvents'
import { useCancelLabel, useCancelCarrierPickup, outboundOf } from '../../../../shipping/queries'
import type { ShipmentView } from "@dorado/contracts";
import { useOrderShipments } from '@dorado/client'

export default function AdminInTransitPurchaseOrder({ view }: PurchaseOrderDrawerContentProps) {
  const { order } = view

  // A CONTAINER for its own parcel (ruling 14) - see the same note in the
  // customer drawer's InTransit. carrier_id is a member of the view now, not a
  // client-side join against the cached service list.
  const { data: shipments = [], isLoading } = useOrderShipments(order.id)
  const shipment = outboundOf(shipments)
  const carrier_id = shipment?.carrier_id ?? null

  const color = 'text-primary'
  return (
    <>
      {shipment?.shipment.shipping_status === 'Label Created' ||
      shipment?.shipment.shipping_status === 'Cancelled' ? (
        <div className="flex flex-col w-full gap-5">
          <PreTransit shipment={shipment} carrierId={carrier_id} color={color} />
        </div>
      ) : (
        <TrackingEvents isLoading={isLoading} shipment={shipment} />
      )}
    </>
  )
}

// A SMALL CONTAINER (ruling 14): the parcel and its carrier arrive as props;
// the carrier PICKUP is the parcel's own child and is fetched here.
export function PreTransit({
  shipment,
  carrierId,
  color,
}: {
  shipment?: ShipmentView
  carrierId: string | null
  color?: string
}) {
  // The carrier booking is the view's own `carrier_pickup` now - the most
  // recent one, which is what `pickups[0]` always meant.
  const carrierPickup = shipment?.carrier_pickup ?? null

  const cancelLabel = useCancelLabel()
  const cancelPickup = useCancelCarrierPickup()

  return (
    <div className="flex flex-col w-full gap-5">
      <div className="flex w-full justify-between items-center">
        <h2>Package Not Yet Scanned</h2>
        {carrierPickup?.confirmation_number && carrierPickup?.requested_at && (
          <Button
            variant="tertiary"
            onClick={() => {
              cancelPickup.mutate({
                carrier_id: carrierId ?? '',
                pickup_id: carrierPickup?.id ?? '',
              })
            }}
          >
            Cancel Pickup
          </Button>
        )}
      </div>
      <div className="flex w-full justify-between items-center">
        <div className="">Tracking Number:</div>
        <div>{shipment?.shipment.tracking_number}</div>
      </div>
      <div className=""></div>

      <div className="flex flex-col gap-2">
        <Button
          variant="secondary"
          intent="danger"
          disabled={
            // `edit_tracking` is true exactly where the parcel has no label of
            // ours - the same question `!shipment?.label` used to ask client-side.
            shipment?.actions.edit_tracking ||
            shipment?.shipment.shipping_status === 'Cancelled' ||
            cancelLabel.isPending
          }
          onClick={() =>
            cancelLabel.mutate({
              carrier_id: carrierId ?? '',
              shipment_id: shipment?.shipment.id ?? '',
            })
          }
        >
          {shipment?.shipment.shipping_status === 'Cancelled'
            ? 'Label Cancelled'
            : cancelLabel.isPending
            ? 'Cancelling'
            : 'Cancel Label'}
        </Button>
      </div>
    </div>
  )
}
