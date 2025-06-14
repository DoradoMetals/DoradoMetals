'use client'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useGetSession } from '@/lib/queries/useAuth'
import { PurchaseOrdersContent } from './purchaseOrders/purchaseOrderTab'
import { SalesOrdersContent } from './salesOrders/salesOrderTab'

export function OrdersTabs() {
  const { user } = useGetSession()

  return (
    <div>
      <Tabs defaultValue="bought" className="flex h-full w-full items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <TabsList className="justify-center w-full gap-2 rounded-none bg-transparent p-0">
            <TabsTrigger value="bought" className="tab-indicator-primary">
              Bought
            </TabsTrigger>
            <TabsTrigger value="sold" className="tab-indicator-primary">
              Sold
            </TabsTrigger>
          </TabsList>
          <div className="separator-inset -mt-[3px]" />
        </div>
        <div className="w-full max-w-lg h-full">
          <TabsContent value="bought">
            {user ? <SalesOrdersContent user={user} /> : <div>Please sign in to see orders.</div>}
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
