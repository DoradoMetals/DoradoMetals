'use client'

import PurchaseOrderDrawerContent from './purchaseOrderDrawerContent'
import PurchaseOrderDrawerHeader from './purchaseOrderDrawerHeader'
import PurchaseOrderDrawerFooter from './purchaseOrderDrawerFooter'
import { PurchaseOrderDrawerProps } from '@/shared/types/purchaseOrders'
import OrderDrawerShell from '@/shared/ui/OrderDrawerShell'

export default function PurchaseOrderDrawer({ order_id, user }: PurchaseOrderDrawerProps) {
  return (
    <OrderDrawerShell
      drawerKey="purchaseOrder"
      orderId={order_id}
      label="Purchase order"
      user={user}
      Header={PurchaseOrderDrawerHeader}
      Content={PurchaseOrderDrawerContent}
      Footer={PurchaseOrderDrawerFooter}
    />
  )
}
