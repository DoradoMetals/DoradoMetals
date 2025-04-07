'use client'

import ProductsTableEditable from './productsPoS/productTable'
import { VerticalTabs, VerticalTabsContent, VerticalTabsList, VerticalTabsTrigger } from '@/components/ui/vertical-tabs'
import ScrapTable from './scrapPoS/scrapTable'
import ScrapInventoryHeaders from './scrapPoS/scrapInventoryHeaders'

export function AdminTabs() {
  return (
      <VerticalTabs orientation="vertical" defaultValue="products" className="w-full flex gap-2 p-10">
        <VerticalTabsList className="flex flex-col gap-2 items-start text-neutral-700 mr-10 p-10 border-r-1 border-border">
        <h3 className="text-neutral-400 text-xs tracking-widest">Inventory</h3>
        <VerticalTabsTrigger
            className="p-0 text-neutral-600 cursor-pointer w-full data-[state=active]:text-primary data-[state=active]:shadow-none"
            value="inventory-overview"
          >
            Inventory Overview
          </VerticalTabsTrigger>
          <VerticalTabsTrigger
            className="p-0 text-neutral-600 cursor-pointer w-full data-[state=active]:text-primary data-[state=active]:shadow-none"
            value="products"
          >
            Bullion
          </VerticalTabsTrigger>
          <VerticalTabsTrigger
            className="p-0 text-neutral-600 cursor-pointer w-full data-[state=active]:text-primary data-[state=active]:shadow-none"
            value="scrap"
          >
            Scrap
          </VerticalTabsTrigger>
          <h3 className="text-neutral-400 text-xs tracking-widest mt-4">Orders</h3>
          <VerticalTabsTrigger
            className="p-0 text-neutral-600 cursor-pointer w-full data-[state=active]:text-primary data-[state=active]:shadow-none"
            value="orders-overview"
          >
            Orders Overview
          </VerticalTabsTrigger>
          <VerticalTabsTrigger
            className="p-0 text-neutral-600 cursor-pointer w-full data-[state=active]:text-primary data-[state=active]:shadow-none"
            value="purchase-orders"
          >
            Purchase Orders
          </VerticalTabsTrigger>
          <VerticalTabsTrigger
            className="p-0 text-neutral-600 cursor-pointer w-full data-[state=active]:text-primary data-[state=active]:shadow-none"
            value="sales-orders"
          >
            Sales Orders
          </VerticalTabsTrigger>
          <h3 className="text-neutral-400 text-xs tracking-widest mt-4">Users</h3>
          <VerticalTabsTrigger
            className="p-0 text-neutral-600 cursor-pointer w-full data-[state=active]:text-primary data-[state=active]:shadow-none"
            value="sales-orders"
          >
            Manage Users
          </VerticalTabsTrigger>
        </VerticalTabsList>
        <VerticalTabsContent value="products"><ProductsTableEditable /></VerticalTabsContent>
        <VerticalTabsContent value="scrap" className='flex flex-col space-y-4'><ScrapInventoryHeaders /><ScrapTable /></VerticalTabsContent>
        <VerticalTabsContent value="overview"></VerticalTabsContent>
        <VerticalTabsContent value="purchase-orders"></VerticalTabsContent>
        <VerticalTabsContent value="sales-orders"></VerticalTabsContent>
      </VerticalTabs>
  )
}
