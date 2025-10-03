import { PurchaseOrderDrawerContentProps } from '@/types/purchase-order'
import ProfitBreakdown from './viewProfitBreakdown'

export default function AdminCompletedPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  return (
    <div className="flex flex-col items-center justify-start w-full h-full">
      <ProfitBreakdown order={order} />
    </div>
  )
}
