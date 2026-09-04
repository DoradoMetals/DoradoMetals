'use client'

import AdminPurchaseOrderDrawerHeader from './adminPurchaseOrderDrawerHeader'
import AdminPurchaseOrderDrawerContent from './adminPurchaseOrderDrawerContent'
import AdminPurchaseOrderDrawerFooter from './adminPurchaseOrderDrawerFooter'

import { useDrawerStore } from '@/shared/store/drawerStore'
import { Drawer } from '@dorado/components'
import { useOrder } from '@dorado/client'

// ONE READ. The drawer used to reach into the admin LIST cache, find its own
// order in it, and then have each child call its own order-scoped read to put
// the rest back together - so what it rendered depended on a list that may or
// may not have been fetched. `useOrder` answers the whole OrderView, and the
// customer's name comes with it (`view.user`).
export default function AdminPurchaseOrderDrawer({ order_id }: { order_id: string }) {
  const { activeDrawer, closeDrawer } = useDrawerStore()
  const isDrawerOpen = activeDrawer === 'purchaseOrder'

  const { data: view } = useOrder(order_id, isDrawerOpen)

  if (!view) return null

  return (
    <Drawer label="Purchase order" open={isDrawerOpen} setOpen={closeDrawer}>
      <AdminPurchaseOrderDrawerHeader
        setIsOrderActive={closeDrawer}
        view={view}
        username={view.user?.name ?? ''}
      />

      <div className="mb-8">
        <AdminPurchaseOrderDrawerContent view={view} />
      </div>
      <div className="mt-auto">
        <AdminPurchaseOrderDrawerFooter view={view} />
      </div>
    </Drawer>
  )
}
