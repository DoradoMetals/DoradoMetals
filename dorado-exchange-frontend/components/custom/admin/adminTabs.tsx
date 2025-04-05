'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ProductsTab from './productsPoS/productsTab'

export function AdminTabs() {
  return (
    <Tabs defaultValue="products" className="flex w-full max-w-lg lg:mt-10">
      <TabsList className="grid w-full grid-cols-3 bg-card">
        <TabsTrigger className="cursor-pointer" value="products">
          Products
        </TabsTrigger>
        <TabsTrigger className="cursor-pointer" value="transactions">
          Transactions
        </TabsTrigger>
        <TabsTrigger className="cursor-pointer" value="shippables">
          Shippables
        </TabsTrigger>
      </TabsList>
      <TabsContent value="products">
        <ProductsTab />
      </TabsContent>
      <TabsContent value="transactions"></TabsContent>
      <TabsContent value="shippables"></TabsContent>
    </Tabs>
  )
}
