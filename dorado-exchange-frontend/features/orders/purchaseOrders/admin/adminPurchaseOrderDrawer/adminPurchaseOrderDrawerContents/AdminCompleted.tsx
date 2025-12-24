import ProfitBreakdown from '@/features/orders/purchaseOrders/admin/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/viewProfitBreakdown'
import { PurchaseOrderDrawerContentProps } from '@/features/orders/purchaseOrders/types'

export default function AdminCompletedPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  return (
    <div className="flex flex-col items-center justify-start w-full h-full">
      <ProfitBreakdown order={order} />
    </div>
  )
}
