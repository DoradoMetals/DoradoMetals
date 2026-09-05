'use client'

import { DollarSign } from '@dorado/icons'
import PurchaseOrderCard from './purchaseOrderCard'
import PurchaseOrderDrawer from './purchaseOrderDrawer/purchaseOrderDrawer'
import { PurchaseOrderStatuses, statusConfig } from '@/features/orders/purchaseOrders/types'
import { OrdersTab } from '@/features/orders/ui/OrdersTab'

export function PurchaseOrdersContent() {
  return (
    <OrdersTab
      direction="purchase"
      statuses={PurchaseOrderStatuses}
      statusConfig={statusConfig}
      emptyIcon={DollarSign}
      emptyCtaLabel="Get a Price Estimate"
      emptyCtaHref="/sell"
      renderCard={(order, setActiveOrderId) => (
        <PurchaseOrderCard order={order} setActivePurchaseOrder={setActiveOrderId} />
      )}
      renderDrawer={(activeOrderId, user) => (
        <PurchaseOrderDrawer order_id={activeOrderId} user={user} />
      )}
    />
  )
}
