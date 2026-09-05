'use client'

import { SalesOrderDrawerProps } from '@/shared/types/salesOrders'
import SalesOrderDrawerHeader from './salesOrderDrawerHeader'
import SalesOrderDrawerContent from './salesOrderDrawerContent'
import SalesOrderDrawerFooter from './salesOrderDrawerFooter'
import OrderDrawerShell from '@/shared/ui/OrderDrawerShell'

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
