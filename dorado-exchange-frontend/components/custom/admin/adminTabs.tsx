'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ProductsTableEditable from './productsPoS/productTable'

export function AdminTabs() {
  return (
    <Tabs defaultValue="products" className="flex w-full lg:w-[65rem] lg:max-w-[65rem] lg:mt-10 mb-8">
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
        <ProductsTableEditable />
      </TabsContent>
      <TabsContent value="transactions"></TabsContent>
      <TabsContent value="shippables"></TabsContent>
    </Tabs>
  )
}
