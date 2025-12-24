import { useEffect, useState } from 'react'
import { cn } from '@/shared/utils/cn'
import { SalesOrderDrawerContentProps, statusConfig } from '@/features/orders/salesOrders/types'
import { Button } from '@/shared/ui/base/button'
import { FloatingLabelInput } from '@/shared/ui/inputs/FloatingLabelInput'
import { RadioGroupImage } from '@/shared/ui/RadioGroupImage'
import { useAdminCarriers, useAdminSuppliers } from '@/features/products/queries'
import { useSalesOrderMetals } from '@/features/orders/salesOrders/users/queries'
import { useSendOrderToSupplier, useUpdateTracking } from '@/features/orders/salesOrders/admin/queries'
import { Carrier, Supplier } from '@/features/products/types'

export default function AdminPreparingSalesOrder({ order }: SalesOrderDrawerContentProps) {
  const { data: suppliers = [] } = useAdminSuppliers()
  const { data: carriers = [] } = useAdminCarriers()
  const { data: orderSpots = [] } = useSalesOrderMetals(order.id)

  const updateTracking = useUpdateTracking()
  const sendOrder = useSendOrderToSupplier()

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
    if (suppliers.length && order.supplier_id) {
      handleSupplierChange(order.supplier_id)
    }
  }, [suppliers, order.supplier_id])

  useEffect(() => {
    if (carriers.length && order.shipment.carrier_id) {
      handleCarrierChange(order.shipment.carrier_id)
    }
  }, [carriers, order.shipment.carrier_id])

  const config = statusConfig[order.sales_order_status]

  return (
    <div className="flex flex-col w-full gap-5">
      <p className="text-sm">
        Order has been paid and is ready to be sent to a supplier. Please select the supplier to
        fill this order.
      </p>
      {suppliers && (
        <RadioGroupImage
          items={suppliers}
          value={selectedSupplier?.id ?? ''}
          onValueChange={handleSupplierChange}
        />
      )}

      <Button
        className={cn(
          'p-4 raised-off-page w-full text-white',
          config.background_color,
          config.hover_background_color,
          !selectedSupplier || (sendOrder.isPending && 'opacity-30')
        )}
        onClick={() => {
          sendOrder.mutate({
            order: order,
            spots: orderSpots,
            supplier_id: selectedSupplier?.id ?? '',
          })
        }}
        disabled={!selectedSupplier || sendOrder.isPending || order.order_sent}
      >
        {sendOrder.isPending
          ? `Sending to ${selectedSupplier?.name}...`
          : order.order_sent
          ? `Order sent to ${selectedSupplier?.name}`
          : selectedSupplier
          ? `Send Order to ${selectedSupplier?.name}`
          : 'Select Supplier'}
      </Button>

      <div className="separator-inset" />

      {carriers && (
        <RadioGroupImage
          items={carriers}
          value={selectedCarrier?.id ?? ''}
          onValueChange={handleCarrierChange}
          disabled={!order.order_sent}
        />
      )}

      <FloatingLabelInput
        type="text"
        className="input-floating-label-form min-w-48"
        label="Tracking Number"
        value={trackingNumber}
        disabled={!selectedCarrier || updateTracking.isPending}
        onChange={(e) => setTrackingNumber(e.target.value)}
      />

      <Button
        className={cn(
          'p-4 raised-off-page w-full text-white',
          config.background_color,
          config.hover_background_color,
          !selectedCarrier || updateTracking.isPending || (trackingNumber === '' && 'opacity-30')
        )}
        onClick={() => {
          updateTracking.mutate({
            order_id: order.id,
            shipment_id: order.shipment.id,
            tracking_number: trackingNumber,
            carrier_id: selectedCarrier?.id ?? '',
          })
        }}
        disabled={!selectedCarrier || updateTracking.isPending || trackingNumber === ''}
      >
        {updateTracking.isPending
          ? `Updating tracking for ${selectedCarrier?.name}...`
          : trackingNumber === ''
          ? `Enter tracking for ${selectedCarrier?.name}`
          : selectedCarrier
          ? order.tracking_updated
            ? `Resend tracking for ${selectedCarrier?.name}`
            : `Update tracking for ${selectedCarrier?.name}`
          : 'Select Carrier'}
      </Button>
    </div>
  )
}
