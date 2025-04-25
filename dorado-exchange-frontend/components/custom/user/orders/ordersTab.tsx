'use client'

import { Dispatch, useEffect, useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { DollarSign, Package } from 'lucide-react'

import { PurchaseOrder, statusConfig } from '@/types/purchase-order'
import { usePurchaseOrders } from '@/lib/queries/usePurchaseOrder'
import { cn } from '@/lib/utils'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import getScrapPrice from '@/utils/getScrapPrice'
import PriceNumberFlow from '../../products/PriceNumberFlow'
import { formatFullDate } from '@/utils/dateFormatting'
import { useUser } from '@/lib/authClient'
import PurchaseOrderDrawer from './purchaseOrderDrawer/purchaseOrderDrawer'
import { User } from '@/types/user'
import { useGetSession } from '@/lib/queries/useAuth'
import getProductBidPrice from '@/utils/getProductBidPrice'

export function OrdersTabs() {
  const { user } = useGetSession()

  return (
    <div>
      <Tabs defaultValue="sold" className="flex h-full w-full items-center justify-center mt-5">
        <div className="w-full max-w-sm">
          <TabsList className="justify-center h-auto w-full gap-2 rounded-none border-b border-border bg-transparent px-0 py-1 text-foreground">
            <TabsTrigger
              value="bought"
              className="cursor-pointer text-neutral-700 after:text-neutral-700 relative after:absolute after:inset-x-0 after:bottom-0 after:-mb-1 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:after:bg-primary"
            >
              Bought
            </TabsTrigger>
            <TabsTrigger
              value="sold"
              className="cursor-pointer text-neutral-700 after:text-neutral-700 relative after:absolute after:inset-x-0 after:bottom-0 after:-mb-1 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:after:bg-primary"
            >
              Sold
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="w-full max-w-sm">
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

  const [isPurchaseOrderActive, setIsPurchaseOrderActive] = useState(false)
  const [activePurchaseOrder, setActivePurchaseOrder] = useState<PurchaseOrder | null>(null)
  const { data: spotPrices = [] } = useSpotPrices()

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
    <div className="rounded-xl p-4">
      {orders.map((order) => {
        const total =
          order.order_items?.reduce((acc, item) => {
            if (item.product && item.item_type === 'product') {
              const spot = spotPrices.find((s) => s.type === item.product?.metal_type)
              const price = getProductBidPrice(item.product, spot)
              const quantity = item?.product?.quantity ?? item.quantity ?? 1
              return acc + price * quantity
            }
            if (item.scrap && item.item_type === 'scrap') {
              const spot = spotPrices.find((s) => s.type === item.scrap?.metal)
              const price = getScrapPrice(item.scrap?.content ?? 0, spot)
              return acc + price
            }

            return acc
          }, 0) ?? 0

        return (
          <div
            key={order.id}
            className="border-b py-4 flex flex-col gap-4 text-sm text-neutral-800"
          >
            <div className="flex justify-between items-center">
              <span className="text-neutral-800 text-base">{formatFullDate(order.created_at)}</span>
              <Button
                variant="link"
                className={cn(
                  'p-0 h-auto text-sm font-normal',
                  statusConfig[order.purchase_order_status]?.text_color
                )}
                onClick={() => {
                  setActivePurchaseOrder(order)
                  setIsPurchaseOrderActive(true)
                }}
              >
                View Order
              </Button>
            </div>
            <div className="flex justify-between items-center">
              <div
                className={cn(
                  'flex items-center gap-2',
                  statusConfig[order.purchase_order_status]?.text_color
                )}
              >
                {(() => {
                  const StatusIcon = statusConfig[order.purchase_order_status]?.icon
                  return StatusIcon ? <StatusIcon size={20} /> : null
                })()}
                <span>{order.purchase_order_status}</span>
              </div>
              <PriceNumberFlow value={total} />
            </div>
          </div>
        )
      })}
      {activePurchaseOrder && (
        <PurchaseOrderDrawer
          order={activePurchaseOrder}
          user={user}
          isOrderActive={isPurchaseOrderActive}
          setIsOrderActive={setIsPurchaseOrderActive}
        />
      )}
    </div>
  )
}
