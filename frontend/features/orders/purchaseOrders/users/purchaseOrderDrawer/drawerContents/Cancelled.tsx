import { Amount, Button } from '@dorado/components'

import { PurchaseOrderDrawerContentProps } from '@/features/orders/purchaseOrders/types'
import TrackingEvents from '@/features/shipping/ui/TrackingEvents'
import { outboundOf, returnOf, useOrderShipments } from '@dorado/client'

export default function CancelledPurchaseOrder({ view }: PurchaseOrderDrawerContentProps) {
  const { order } = view

  // The metal is going BACK, so the parcel this screen tracks is the return
  // one - filtered on the row's own `direction`, not a named slot.
  const { data: shipments = [], isLoading } = useOrderShipments(order.id)
  const shipment = outboundOf(shipments)
  const returnShipment = returnOf(shipments)

  const handlePayShipping = () => {}

  return (
    <div className="flex flex-col w-full h-full">
      {!view.totals?.shipping_paid ? (
        <div className="flex flex-col h-full w-full mb-4 gap-6">
          <div className="flex flex-col w-full">
            <div className="flex w-full justify-between items-center mb-1">
              <strong className="stat-sm">Shipping Charges:</strong>
              <strong className="stat-sm">
                <Amount
                  value={(shipment?.shipment.cost ?? 0) + (returnShipment?.shipment.cost ?? 0)}
                />
              </strong>
            </div>
            <Button className="w-full p-4" onClick={handlePayShipping}>
              Pay Shipping Charges
            </Button>
          </div>
        </div>
      ) : (
        <TrackingEvents isLoading={isLoading} shipment={returnShipment} />
      )}
    </div>
  )
}
