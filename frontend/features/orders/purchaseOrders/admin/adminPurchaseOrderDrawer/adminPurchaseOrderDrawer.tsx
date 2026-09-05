'use client'

import AdminPurchaseOrderDrawerHeader from './adminPurchaseOrderDrawerHeader'
import AdminPurchaseOrderDrawerContent from './adminPurchaseOrderDrawerContent'
import AdminPurchaseOrderDrawerFooter from './adminPurchaseOrderDrawerFooter'
import OrderDrawerShell from '@/features/orders/ui/OrderDrawerShell'

export default function AdminPurchaseOrderDrawer({ order_id }: { order_id: string }) {
  return (
    <OrderDrawerShell
      drawerKey="purchaseOrder"
      orderId={order_id}
      label="Purchase order"
      headerClosesDrawer
      Header={AdminPurchaseOrderDrawerHeader}
      Content={AdminPurchaseOrderDrawerContent}
      Footer={AdminPurchaseOrderDrawerFooter}
    />
  )
}
