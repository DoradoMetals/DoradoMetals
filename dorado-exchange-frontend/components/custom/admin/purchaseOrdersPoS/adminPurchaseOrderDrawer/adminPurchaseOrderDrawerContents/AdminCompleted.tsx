import { cn } from '@/lib/utils'
import { PurchaseOrderDrawerContentProps, statusConfig } from '@/types/purchase-order'
import ProfitBreakdown from './viewProfitBreakdown'

export default function AdminCompletedPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const config = statusConfig[order.purchase_order_status]

  return (
    <div className="flex flex-col items-center justify-center w-full h-full">
      <ProfitBreakdown order={order} />
    </div>
  )
}
