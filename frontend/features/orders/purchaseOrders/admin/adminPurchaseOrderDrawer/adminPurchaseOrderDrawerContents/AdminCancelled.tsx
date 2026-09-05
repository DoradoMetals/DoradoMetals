import { Amount, Button } from '@dorado/components'
import { cn } from '@/shared/utils/cn'
import { PurchaseOrderDrawerContentProps, statusConfig } from '@/features/orders/purchaseOrders/types'
import { outboundOf, returnOf } from '@/features/shipping/queries'
import TrackingEvents from '@/features/shipping/ui/TrackingEvents'
import { useOrderShipments } from '@dorado/client'

export default function AdminCancelledPurchaseOrder({ view }: PurchaseOrderDrawerContentProps) {
  const { order } = view

  // A CONTAINER for its own parcels (ruling 14). `shipment` and
  // `return_shipment` were two named slots for one table; shipments are one
  // read now, filtered on the row's own `direction` column. The view already
  // carries the service's carrier and the progress timeline, so no client-side
  // join is left to do.
  const { data: shipments = [], isLoading } = useOrderShipments(order.id)
  const shipment = outboundOf(shipments)
  const returnShipment = returnOf(shipments)

  const config = statusConfig[order.status ?? '']

  const handleMarkShippingPaid = () => {}

  return (
    <>
      <div className="flex flex-col w-full h-full">
        {!view.totals?.shipping_paid ? (
          <div className="flex flex-col w-full h-auto border border-border p-4 rounded-lg">
            <div className="flex w-full justify-between items-center mb-1">
              <strong className="stat-sm">Customer Payment:</strong>
              <strong className="stat-sm">
                {view.totals?.shipping_paid ? 'Complete' : 'Incomplete'}
              </strong>
            </div>
            <div className="flex w-full justify-between items-center mb-3">
              <strong className="stat-sm">Payment Due:</strong>
              <strong className="stat-sm">
                <Amount
                  value={(shipment?.shipment.cost ?? 0) + (returnShipment?.shipment.cost ?? 0)}
                />
              </strong>
            </div>
            <Button
              variant="tertiary"
              className="p-0 ml-auto"
              onClick={() => {
                handleMarkShippingPaid
              }}
            >
              Mark Shipping Paid
            </Button>
          </div>
        ) : (
          <TrackingEvents isLoading={isLoading} shipment={returnShipment} />
        )}
      </div>
    </>
  )
}
