import { Button } from '@dorado/components'
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
  useOrderShipments,
  useShipmentPickups,
  useShipmentDisplay,
  outboundOf,
} from '@/features/shipping/queries'
import type { Shipment } from "@dorado/contracts";

export default function AdminInTransitPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  // A CONTAINER for its own parcel (ruling 14) - see the same note in the
  // customer drawer's InTransit.
  const { data: shipments = [] } = useOrderShipments(order.id)
  const shipment = outboundOf(shipments)
  const { carrier_id } = useShipmentDisplay(shipment)

  const { data: trackingInfo, isLoading } = useTracking({
    shipment_id: shipment?.id ?? '',
    tracking_number: shipment?.tracking_number ?? '',
    carrier_id: carrier_id ?? '',
  })

  const color = 'text-primary'
  return (
    <>
      {shipment?.shipping_status === 'Label Created' ||
      shipment?.shipping_status === 'Cancelled' ? (
        <div className="flex flex-col w-full gap-5">
          <PreTransit shipment={shipment} carrierId={carrier_id} color={color} />
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

// A SMALL CONTAINER (ruling 14): the parcel and its carrier arrive as props;
// the carrier PICKUP is the parcel's own child and is fetched here.
export function PreTransit({
  shipment,
  carrierId,
  color,
}: {
  shipment?: Shipment
  carrierId: string | null
  color?: string
}) {
  const { data: pickups = [] } = useShipmentPickups(shipment?.id)
  const carrierPickup = pickups[0] ?? null

  const cancelLabel = useShippingCancelLabel()
  const cancelPickup = useShippingCancelPickup()

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
        <div>{shipment?.tracking_number}</div>
      </div>
      <div className=""></div>

      <div className="flex flex-col gap-2">
        <Button
          variant="secondary"
          intent="danger"
          disabled={
            !shipment?.label ||
            shipment?.shipping_status === 'Cancelled' ||
            cancelLabel.isPending
          }
          onClick={() =>
            cancelLabel.mutate({
              carrier_id: carrierId ?? '',
              shipment_id: shipment?.id ?? '',
            })
          }
        >
          {shipment?.shipping_status === 'Cancelled'
            ? 'Label Cancelled'
            : cancelLabel.isPending
            ? 'Cancelling'
            : 'Cancel Label'}
        </Button>
      </div>
    </div>
  )
}
