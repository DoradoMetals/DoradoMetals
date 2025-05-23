import { cn } from '@/lib/utils'
import { PurchaseOrderDrawerContentProps, statusConfig } from '@/types/purchase-order'

export default function AdminCompletedPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const config = statusConfig[order.purchase_order_status]

  return (
    <div className="flex flex-col items-center justify-center sm:px-6 w-full h-full">
      <config.icon className={cn(config.text_color, 'mb-6')} size={128} strokeWidth={1.5} />
      <h2 className="text-2xl text-neutral-800 mb-2">Order Complete!</h2>
    </div>
  )
}
