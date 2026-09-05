'use client'

import { ClipboardList } from '@dorado/icons'
import { SalesOrderStatuses, statusConfig } from '@/shared/types/salesOrders'
import { OrdersTab } from '../ui/OrdersTab'
import SalesOrderCard from './salesOrderCard'
import SalesOrderDrawer from './salesOrderDrawer/salesOrderDrawer'

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
