import { cn } from '@/lib/utils'
import { PurchaseOrderDrawerContentProps, statusConfig } from '@/types/purchase-order'

export default function AdminAcceptedPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const config = statusConfig[order.purchase_order_status]

  return (
    <div className="flex flex-col items-center justify-center sm:px-6 w-full h-full">
      <config.icon className={cn(config.text_color, 'mb-6')} size={128} strokeWidth={1.5} />
      <h2 className="text-2xl text-neutral-800 mb-2">Customer Accepted!</h2>

      <p className="text-sm text-neutral-700 mb-6 lg:px-14 text-center">
        Customer has an accepted an offer total of ${order.total_price?.toFixed(2)}. Once you are
        ready, please move the order to Payment Processing.
      </p>
    </div>
  )
}
