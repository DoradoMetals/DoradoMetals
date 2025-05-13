'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { DollarSign } from 'lucide-react'

import { PurchaseOrder, statusConfig } from '@/types/purchase-order'
import { usePurchaseOrders } from '@/lib/queries/usePurchaseOrder'
import { cn } from '@/lib/utils'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import getScrapPrice from '@/utils/getScrapPrice'
import PriceNumberFlow from '../../products/PriceNumberFlow'
import { formatFullDate } from '@/utils/dateFormatting'
import PurchaseOrderDrawer from './purchaseOrderDrawer/purchaseOrderDrawer'
import { User } from '@/types/user'
import { useGetSession } from '@/lib/queries/useAuth'
import getProductBidPrice from '@/utils/getProductBidPrice'
import { useDrawerStore } from '@/store/drawerStore'
import PurchaseOrderCard from './purchaseOrderCard'

export function OrdersTabs() {
  const { user } = useGetSession()

  return (
    <div>
      <Tabs defaultValue="sold" className="flex h-full w-full items-center justify-center mt-5">
        <div className="w-full max-w-lg">
          <TabsList className="justify-center w-full gap-2 rounded-none bg-transparent">
            <TabsTrigger value="bought" className="tab-indicator-primary">
              Bought
            </TabsTrigger>
            <TabsTrigger value="sold" className="tab-indicator-primary">
              Sold
            </TabsTrigger>
          </TabsList>
          <div className="separator-inset -mt-[3px]" />
        </div>
        <div className="w-full max-w-lg">
          <TabsContent value="bought">
            <div>No Orders yet</div>
          </TabsContent>

          <TabsContent value="sold">
            {user ? (
              <PurchaseOrdersContent user={user} />
            ) : (
              <div>Please sign in to see orders.</div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}

function PurchaseOrdersContent({ user }: { user: User }) {
  const { data: orders = [], isLoading } = usePurchaseOrders()
  const [activePurchaseOrder, setActivePurchaseOrder] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        Loading orders...
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl mt-2">
        <DollarSign className="w-10 h-10 text-muted-foreground" />
        <p className="text-lg font-medium text-muted-foreground">No Orders Yet!</p>
        <Button variant="default" size="sm">
          Start Selling
        </Button>
      </div>
    )
  }

  return (
    <div className="p-4 mt-5">
      {orders.map((order) => {
        return (
          <div key={order.id} className="py-2 flex flex-col gap-2 text-sm text-neutral-800">
            <PurchaseOrderCard order={order} setActivePurchaseOrder={setActivePurchaseOrder} />
          </div>
        )
      })}

      {activePurchaseOrder && <PurchaseOrderDrawer order_id={activePurchaseOrder} user={user} />}
    </div>
  )
}
