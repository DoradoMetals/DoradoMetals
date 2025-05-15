import { useAdminPurchaseOrders } from '@/lib/queries/admin/useAdminPurchaseOrders'
import { statusConfig } from '@/types/purchase-order'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export default function PurchaseOrderCards({
  selectedStatus,
  setSelectedStatus,
}: {
  selectedStatus: string | null
  setSelectedStatus: (status: string | null) => void
}) {
  const { data: purchaseOrders = [] } = useAdminPurchaseOrders()

  // Count orders by status
  const statusCounts = purchaseOrders.reduce<Record<string, number>>((acc, order) => {
    const status = order.purchase_order_status
    acc[status] = (acc[status] || 0) + 1
    return acc
  }, {})

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {Object.entries(statusConfig).map(([status, config]) => {
        const Icon = config.icon
        const count = statusCounts[status] ?? 0
        const isSelected = selectedStatus === status

        return (
          <Button
            variant="ghost"
            key={status}
            onClick={() => setSelectedStatus(isSelected ? null : status)}
            className={cn(
              'hidden sm:flex items-center justify-between rounded-lg p-4 bg-card raised-off-page mt-4 w-full h-auto transition-colors hover:bg-highest',
              isSelected && `${config.border_color} border-2`
            )}
          >
            <div className="flex w-full items-center gap-2 justify-between">
              <Icon size={42} className={config.text_color} />
              <div className="flex flex-col ml-auto items-end">
                <div className="text-2xl text-neutral-900">{count}</div>
                <h2 className="text-base text-neutral-600">{status}</h2>
              </div>
            </div>
          </Button>
        )
      })}
    </div>
  )
}