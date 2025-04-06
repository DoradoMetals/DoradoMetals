'use client'

import ProductsTableEditable from './productsPoS/productTable'
import { VerticalTabs, VerticalTabsContent, VerticalTabsList, VerticalTabsTrigger } from '@/components/ui/vertical-tabs'

export function AdminTabs() {
  return (

      <VerticalTabs orientation="vertical" defaultValue="products" className="flex justify-start gap-2">
        <VerticalTabsList className="flex flex-col bg-transparent gap-2 items-start text-neutral-700 justify-start">
        <h3 className="text-neutral-500 text-base tracking-widest">Inventory</h3>
        <VerticalTabsTrigger
            className="p-0 pl-2 text-neutral-700 cursor-pointer w-full justify-start data-[state=active]:text-primary data-[state=active]:shadow-none"
            value="inventory-overview"
          >
            Inventory Overview
          </VerticalTabsTrigger>
          <VerticalTabsTrigger
            className="p-0 pl-2 text-neutral-700 cursor-pointer w-full justify-start data-[state=active]:text-primary data-[state=active]:shadow-none"
            value="products"
          >
            Bullion
          </VerticalTabsTrigger>
          <VerticalTabsTrigger
            className="p-0 pl-2 text-neutral-700 cursor-pointer w-full justify-start data-[state=active]:text-primary data-[state=active]:shadow-none"
            value="scrap"
          >
            Scrap
          </VerticalTabsTrigger>
          <h3 className="text-neutral-500 text-base tracking-widest">Orders</h3>
          <VerticalTabsTrigger
            className="p-0 pl-2 text-neutral-700 cursor-pointer w-full justify-start data-[state=active]:text-primary data-[state=active]:shadow-none"
            value="orders-overview"
          >
            Orders Overview
          </VerticalTabsTrigger>
          <VerticalTabsTrigger
            className="p-0 pl-2 text-neutral-700 cursor-pointer w-full justify-start data-[state=active]:text-primary data-[state=active]:shadow-none"
            value="purchase-orders"
          >
            Purchase Orders
          </VerticalTabsTrigger>
          <VerticalTabsTrigger
            className="p-0 pl-2 text-neutral-700 cursor-pointer w-full justify-start data-[state=active]:text-primary data-[state=active]:shadow-none"
            value="sales-orders"
          >
            Sales Orders
          </VerticalTabsTrigger>
          <h3 className="text-neutral-500 text-base tracking-widest">Users</h3>
          <VerticalTabsTrigger
            className="p-0 pl-2 text-neutral-700 cursor-pointer w-full justify-start data-[state=active]:text-primary data-[state=active]:shadow-none"
            value="sales-orders"
          >
            Manage Users
          </VerticalTabsTrigger>


        </VerticalTabsList>
        <VerticalTabsContent value="products"><ProductsTableEditable /></VerticalTabsContent>
        <VerticalTabsContent value="scrap"></VerticalTabsContent>
        <VerticalTabsContent value="overview"></VerticalTabsContent>
        <VerticalTabsContent value="purchase-orders"></VerticalTabsContent>
        <VerticalTabsContent value="sales-orders"></VerticalTabsContent>
      </VerticalTabs>
  )
}
