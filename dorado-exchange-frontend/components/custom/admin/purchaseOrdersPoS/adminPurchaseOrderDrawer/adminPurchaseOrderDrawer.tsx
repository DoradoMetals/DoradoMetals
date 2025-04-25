'use client'

import OrderDrawer from '@/components/drawers/orderDrawer'
import AdminPurchaseOrderDrawerHeader from './adminPurchaseOrderDrawerHeader'
import AdminPurchaseOrderDrawerContent from './adminPurchaseOrderDrawerContent'

import { AdminPurchaseOrderDrawerProps } from '@/types/admin'
import { useAdminUser } from '@/lib/queries/admin/useAdminUser'


export default function AdminPurchaseOrderDrawer({
  order,
  user_id,
  isOrderActive,
  setIsOrderActive,
}: AdminPurchaseOrderDrawerProps) {
  const { data: user } = useAdminUser(user_id, { enabled: isOrderActive })

  return (
    <OrderDrawer open={isOrderActive} setOpen={setIsOrderActive}>
      <div className="space-y-4 p-5">
        <AdminPurchaseOrderDrawerHeader order={order} username={user?.name ?? ''} />
        <AdminPurchaseOrderDrawerContent order={order} />
      </div>
    </OrderDrawer>
  )
}
