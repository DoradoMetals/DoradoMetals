'use client'

import ProductsTableEditable from './productsPoS/productTable'
import PurchaseOrdersTable from './purchaseOrdersPoS/purchaseOrdersTable'
import PurchaseOrderCards from './purchaseOrdersPoS/purchaseOrderCards'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ScrapCards from './scrapPoS/ScrapCards'
import ProductCards from './productsPoS/productCards'
import ProductsInventory from './productsPoS/productsInventory'
import AdminPurchaseOrders from './purchaseOrdersPoS/AdminPurchaseOrders'
import { UsersPage } from './usersPoS/usersPage'
import UsersTable from './usersPoS/usersTable'

export function AdminTabs() {
  return (
    <>
      <div className="flex w-full mt-4 lg:mt-10">
        <Tabs defaultValue="inventory" className="flex w-full items-center justify-center">
          <TabsList className="justify-center grid grid-cols-3 w-full max-w-4xl bg-transparent px-0">
            <TabsTrigger className="tab-indicator-secondary" value="inventory">
              Inventory
            </TabsTrigger>
            <TabsTrigger className="tab-indicator-secondary" value="orders">
              Orders
            </TabsTrigger>
            <TabsTrigger className="tab-indicator-secondary" value="users">
              Users
            </TabsTrigger>
          </TabsList>
          <div className="separator-inset -mt-[11px] max-w-4xl" />

          <TabsContent value="inventory" className="max-w-4xl">
            <Tabs defaultValue="products" className="mt-3">
              <TabsList className="justify-center h-auto w-full gap-2 bg-transparent px-0">
                <TabsTrigger value="products" className="tab-indicator-primary">
                  Products
                </TabsTrigger>
                <TabsTrigger value="scrap" className="tab-indicator-primary">
                  Scrap
                </TabsTrigger>
              </TabsList>
              <div className="separator-inset -mt-[11px] max-w-4xl" />

              <TabsContent value="products" className="mt-4">
                <ProductsInventory />
              </TabsContent>
              <TabsContent value="scrap" className="space-y-4 justify-center">
                <ScrapCards />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="orders" className="max-w-4xl">
            <Tabs defaultValue="purchase-orders" className="mt-3 flex justify-center items-center">
              <div className="flex flex-col w-full justify-center gap-3">
                <TabsList className="justify-center h-auto w-full gap-2 rounded-none bg-transparent px-0 text-foreground">
                  <TabsTrigger value="purchase-orders" className="tab-indicator-primary">
                    Purchase Orders
                  </TabsTrigger>
                  <TabsTrigger value="sales-orders" className="tab-indicator-primary">
                    Sales Orders
                  </TabsTrigger>
                </TabsList>
                <div className="separator-inset -mt-[15px] max-w-4xl" />

                <TabsContent value="purchase-orders">
                  <AdminPurchaseOrders />
                </TabsContent>
                <TabsContent value="sales-orders">
                  <div>Under Construction</div>
                </TabsContent>
              </div>
            </Tabs>
          </TabsContent>

          <TabsContent value="users" className="flex flex-col gap-2 max-w-4xl">
            <UsersPage />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
