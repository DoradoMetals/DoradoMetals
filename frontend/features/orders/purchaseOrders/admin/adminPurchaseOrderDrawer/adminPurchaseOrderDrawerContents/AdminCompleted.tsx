import ProfitBreakdown from '@/features/orders/purchaseOrders/admin/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/viewProfitBreakdown'
import { PurchaseOrderDrawerContentProps } from '@/features/orders/purchaseOrders/types'

export default function AdminCompletedPurchaseOrder({ view }: PurchaseOrderDrawerContentProps) {
  const { order } = view

  return (
    <div className="flex flex-col items-center justify-start w-full h-full">
      <ProfitBreakdown view={view} />
    </div>
  )
}
