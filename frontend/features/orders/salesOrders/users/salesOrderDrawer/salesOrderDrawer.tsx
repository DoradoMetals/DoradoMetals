'use client'

import { SalesOrderDrawerProps } from '@/features/orders/salesOrders/types'
import SalesOrderDrawerHeader from '@/features/orders/salesOrders/users/salesOrderDrawer/salesOrderDrawerHeader'
import SalesOrderDrawerContent from '@/features/orders/salesOrders/users/salesOrderDrawer/salesOrderDrawerContent'
import SalesOrderDrawerFooter from '@/features/orders/salesOrders/users/salesOrderDrawer/salesOrderDrawerFooter'
import OrderDrawerShell from '@/features/orders/ui/OrderDrawerShell'

export default function SalesOrderDrawer({ order_id, user }: SalesOrderDrawerProps) {
  return (
    <OrderDrawerShell
      drawerKey="salesOrder"
      orderId={order_id}
      label="Sales order"
      user={user}
      className="max-w-full"
      contentClassName="flex-1 overflow-y-auto pb-30 sm:pb-5"
      footerClassName={null}
      Header={SalesOrderDrawerHeader}
      Content={SalesOrderDrawerContent}
      Footer={SalesOrderDrawerFooter}
    />
  )
}
