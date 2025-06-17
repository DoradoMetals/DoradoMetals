import { useState } from 'react'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { useSendOrderToSupplier, useUpdateTracking } from '@/lib/queries/admin/useAdminSalesOrders'
import { useGetAllSuppliers } from '@/lib/queries/admin/useSuppliers'
import { SalesOrderDrawerContentProps, statusConfig } from '@/types/sales-orders'
import { Supplier } from '@/types/supplier'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { useSalesOrderMetals } from '@/lib/queries/useSalesOrders'
import { FloatingLabelInput } from '@/components/ui/floating-label-input'

export default function AdminPreparingSalesOrder({ order }: SalesOrderDrawerContentProps) {
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const { data: suppliers = [] } = useGetAllSuppliers()
  const { data: orderSpots = [] } = useSalesOrderMetals(order.id)

  const updateTracking = useUpdateTracking()
  const sendOrder = useSendOrderToSupplier()

  const handleSupplierChange = (supplierId: string) => {
    const sup = suppliers.find((s) => s.id === supplierId) ?? null
    setSelectedSupplier(sup)
  }

  const config = statusConfig[order.sales_order_status]

  return (
    <div className="flex flex-col w-full gap-5">
      <p className="text-sm">
        Order has been paid and is ready to be sent to a supplier. Please select the supplier to
        fill this order.
      </p>
      {suppliers && (
        <RadioGroup
          value={selectedSupplier?.id ?? ''}
          onValueChange={handleSupplierChange}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full"
        >
          {suppliers.map((sup) => {
            return (
              <label
                key={sup.id}
                htmlFor={`supplier-${sup.id}`}
                className={cn(
                  'raised-off-page relative peer flex flex-col items-center justify-center w-full gap-1 rounded-lg bg-background px-4 py-3 cursor-pointer transition-colors has-[[data-state=checked]]:bg-card has-[[data-state=checked]]:shadow-md',
                  sup.is_active && 'opacity-30 pointer-events-none'
                )}
              >
                <div className="flex flex-col justify-center items-center gap-3">
                  <Image
                    src={sup.logo ?? ''}
                    width={110}
                    height={110}
                    className="pointer-events-none cursor-auto object-contain focus:outline-none drop-shadow-lg"
                    alt={sup.logo ?? ''}
                  />
                  <div className="text-lg text-neutral-800">{sup.name}</div>
                </div>
                <RadioGroupItem id={`supplier-${sup.id}`} value={sup.id} className="sr-only" />
              </label>
            )
          })}
        </RadioGroup>
      )}

      <Button
        className={cn(
          'p-4 raised-off-page w-full text-white',
          config.background_color,
          config.hover_background_color,
          !selectedSupplier && 'opacity-30'
        )}
        onClick={() => {
          sendOrder.mutate({
            order: order,
            spots: orderSpots,
            supplier_id: selectedSupplier?.id ?? '',
          })
        }}
        disabled={!selectedSupplier}
      >
        Send Order To Supplier
      </Button>

      <div className="separator-inset" />

      <FloatingLabelInput
        type="text"
        className="input-floating-label-form min-w-48"
        label="Tracking Number"
        defaultValue={''}
        disabled={!order.order_sent}
        onBlur={(e) =>
          updateTracking.mutate({ order_id: order.id, tracking_number: e.target.value })
        }
      />
    </div>
  )
}
