'use client'

import { DollarSign } from '@dorado/icons'
import PurchaseOrderCard from './purchaseOrderCard'
import PurchaseOrderDrawer from './purchaseOrderDrawer/purchaseOrderDrawer'
import { PurchaseOrderStatuses, statusConfig } from '@/shared/types/purchaseOrders'
import { OrdersTab } from '../ui/OrdersTab'

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
