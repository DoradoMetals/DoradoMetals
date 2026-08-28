import { useEffect, useState } from 'react'
import { cn } from '@/shared/utils/cn'
import { SalesOrderDrawerContentProps, statusConfig } from '@/features/orders/salesOrders/types'
import { Button } from '@/shared/ui/base/button'
import { FloatingLabelInput } from '@/shared/ui/inputs/FloatingLabelInput'
import { RadioGroupImage } from '@/shared/ui/RadioGroupImage'
import { useAdminSuppliers } from '@/features/products/queries'
import { usePatchOrder } from '@/features/orders/patch'
import {
  usePatchShipment,
  useOrderShipments,
  useShipmentDisplay,
  outboundOf,
} from '@/features/shipping/queries'
import { useRefinerOrder } from '@/features/refiners/queries'
import { Supplier } from '@/features/products/types'
import { useCarriers } from '@/features/carriers/queries'
import { Carrier } from '@/features/carriers/types'

export default function AdminPreparingSalesOrder({ order }: SalesOrderDrawerContentProps) {
  const { data: suppliers = [] } = useAdminSuppliers()
  // WHICH REFINERY HAS THE METAL IS THE ENGAGEMENT'S (ruling 6): the composed
  // wire aliased refiners.orders.refiner_id onto the order as supplier_id, and
  // orders.orders.refinery_id was dropped in 094.
  const { data: engagement } = useRefinerOrder(order.id)
  const { data: shipments = [] } = useOrderShipments(order.id)
  const shipment = outboundOf(shipments)
  const { carrier_id: shipmentCarrierId } = useShipmentDisplay(shipment)
  const { data: carriers = [] } = useCarriers()

  // Tracking writes to the SHIPMENT resource; the supplier send is the order
  // document's own pipeline op.
  const updateTracking = usePatchShipment()
  const sendOrder = usePatchOrder()

  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [selectedCarrier, setSelectedCarrier] = useState<Carrier | null>(null)
  const [trackingNumber, setTrackingNumber] = useState('')

  const handleSupplierChange = (supplierId: string) => {
    const supplier = suppliers.find((s) => s.id === supplierId) ?? null
    setSelectedSupplier(supplier)
  }

  const handleCarrierChange = (carrierId: string) => {
    const carrier = carriers.find((c) => c.id === carrierId) ?? null
    setSelectedCarrier(carrier)
  }

  useEffect(() => {
    if (suppliers.length && engagement?.refiner_id) {
      handleSupplierChange(engagement.refiner_id)
    }
  }, [suppliers, engagement?.refiner_id])

  useEffect(() => {
    if (carriers.length && shipmentCarrierId) {
      handleCarrierChange(shipmentCarrierId)
    }
  }, [carriers, shipmentCarrierId])

  const config = statusConfig[order.status ?? '']

  return (
    <div className="flex flex-col w-full gap-5">
      <p className="text-sm">
        Order has been paid and is ready to be sent to a supplier. Please select the supplier to
        fill this order.
      </p>
      {suppliers && (
        <RadioGroupImage
          items={suppliers.map((s) => ({
            id: s.id,
            name: s.organization.name ?? '',
            logo: s.logo ?? '',
            is_active: !!s.organization.enabled,
          }))}
          value={selectedSupplier?.id ?? ''}
          onValueChange={handleSupplierChange}
        />
      )}

      <Button
        className={cn(
          'p-4 w-full',
          !selectedSupplier || (sendOrder.isPending && 'opacity-30')
        )}
        onClick={() => {
          // The refiner's copy prints the order's own frozen spots, resolved
          // SERVER-side - the browser no longer reads them back and posts them.
          sendOrder.mutate({
            id: order.id,
            patch: { supplier: { supplier_id: selectedSupplier?.id ?? '', send: true } },
          })
        }}
        disabled={!selectedSupplier || sendOrder.isPending || !!order.order_sent}
      >
        {sendOrder.isPending
          ? `Sending to ${selectedSupplier?.organization.name}...`
          : order.order_sent
          ? `Order sent to ${selectedSupplier?.organization.name}`
          : selectedSupplier
          ? `Send Order to ${selectedSupplier?.organization.name}`
          : 'Select Supplier'}
      </Button>

      <div className="glass-divider" />

      {carriers && (
        <RadioGroupImage
          items={carriers.map((c) => ({
            id: c.id,
            name: c.organization.name ?? '',
            logo: c.logo ?? '',
            is_active: !!c.organization.enabled,
          }))}
          value={selectedCarrier?.id ?? ''}
          onValueChange={handleCarrierChange}
          disabled={!order.order_sent}
        />
      )}

      <FloatingLabelInput
        type="text"
        className="on-glass min-w-48"
        label="Tracking Number"
        value={trackingNumber}
        disabled={!selectedCarrier || updateTracking.isPending}
        onChange={(e) => setTrackingNumber(e.target.value)}
      />

      <Button
        className={cn(
          'p-4 w-full',
          !selectedCarrier || updateTracking.isPending || (trackingNumber === '' && 'opacity-30')
        )}
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
