'use client'

import { ClipboardList } from '@dorado/icons'
import { SalesOrderStatuses, statusConfig } from '@/features/orders/salesOrders/types'
import { OrdersTab } from '@/features/orders/ui/OrdersTab'
import SalesOrderCard from '@/features/orders/salesOrders/users/salesOrderCard'
import SalesOrderDrawer from '@/features/orders/salesOrders/users/salesOrderDrawer/salesOrderDrawer'

export function SalesOrdersContent() {
  return (
    <OrdersTab
      direction="sale"
      statuses={SalesOrderStatuses}
      statusConfig={statusConfig}
      emptyIcon={ClipboardList}
      emptyCtaLabel="Start Buying"
      emptyCtaHref="/buy"
      renderCard={(order, setActiveOrderId) => (
        <SalesOrderCard order={order} setActiveOrder={setActiveOrderId} />
      )}
      renderDrawer={(activeOrderId, user) => (
        <SalesOrderDrawer order_id={activeOrderId} user={user} />
      )}
    />
  )
}
