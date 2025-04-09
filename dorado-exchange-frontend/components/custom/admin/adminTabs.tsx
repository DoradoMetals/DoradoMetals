'use client'

import ProductsTableEditable from './productsPoS/productTable'
import PurchaseOrdersTable from './purchaseOrdersPoS/purchaseOrdersTable'
import PurchaseOrderCards from './purchaseOrdersPoS/purchaseOrderCards'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function AdminTabs() {
  return (
    <>
      <div className="flex w-full px-3">
        <Tabs defaultValue="inventory" className="flex w-full items-center justify-center">
          <TabsList className="justify-center grid grid-cols-3 w-full sm:w-[50rem] bg-card">
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
          </TabsList>

          <TabsContent value="inventory">
            <Tabs defaultValue="products" className="mt-3 space-y-4">
              <TabsList className="justify-center h-auto w-full gap-2 rounded-none border-b border-border bg-transparent px-0 py-1 text-foreground">
                <TabsTrigger
                  value="products"
                  className="cursor-pointer text-neutral-700 after:text-neutral-700 relative after:absolute after:inset-x-0 after:bottom-0 after:-mb-1 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:after:bg-primary"
                >
                  Products
                </TabsTrigger>
                <TabsTrigger
                  value="scrap"
                  className="cursor-pointer text-neutral-700 after:text-neutral-700 relative after:absolute after:inset-x-0 after:bottom-0 after:-mb-1 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:after:bg-primary"
                >
                  Scrap
                </TabsTrigger>
              </TabsList>
              <TabsContent value="products">
                <ProductsTableEditable />
              </TabsContent>
              <TabsContent value="scrap"></TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="orders">
            <Tabs defaultValue="purchase-orders" className="mt-3">
              <TabsList className="justify-center h-auto w-full gap-2 rounded-none border-b border-border bg-transparent px-0 py-1 text-foreground">
                <TabsTrigger
                  value="purchase-orders"
                  className="cursor-pointer text-neutral-700 after:text-neutral-700 relative after:absolute after:inset-x-0 after:bottom-0 after:-mb-1 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:after:bg-primary"
                >
                  Purchase Orders
                </TabsTrigger>
                <TabsTrigger
                  value="sales-orders"
                  className="cursor-pointer text-neutral-700 after:text-neutral-700 relative after:absolute after:inset-x-0 after:bottom-0 after:-mb-1 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:after:bg-primary"
                >
                  Sales Orders
                </TabsTrigger>
              </TabsList>
              <TabsContent value="purchase-orders">
                <div className="space-y-4">
                  <PurchaseOrderCards />
                  <PurchaseOrdersTable />
                </div>
              </TabsContent>
              <TabsContent value="sales-orders"></TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="users"></TabsContent>
        </Tabs>
      </div>
    </>
  )
}
