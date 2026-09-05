import ProfitBreakdown from './viewProfitBreakdown'
import { PurchaseOrderDrawerContentProps } from '@/shared/types/purchaseOrders'

export default function AdminCompletedPurchaseOrder({ view }: PurchaseOrderDrawerContentProps) {
  const { order } = view

  return (
    <div className="flex flex-col items-center justify-start w-full h-full">
      <ProfitBreakdown view={view} />
    </div>
  )
}
