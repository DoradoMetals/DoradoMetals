'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import AccountTab from './account/accountTab'
import { OrdersTabs } from './orders/ordersTab'

export function UserTabs() {
  return (
    <Tabs defaultValue="account" className="w-full sm:max-w-2xl mt-3 lg:mt-10">
      <TabsList className="grid w-full grid-cols-4 bg-transparent">
        <TabsTrigger className="tab-indicator-secondary" value="account">
          Account
        </TabsTrigger>
        <TabsTrigger className="tab-indicator-secondary" value="security">
          Security
        </TabsTrigger>
        <TabsTrigger className="tab-indicator-secondary" value="orders">
          Orders
        </TabsTrigger>
        <TabsTrigger className="tab-indicator-secondary" value="support">
          Support
        </TabsTrigger>
      </TabsList>
      <div className="separator-inset -mt-[11px]" />

      <TabsContent value="account">
        
      </TabsContent>
      <TabsContent value="security"></TabsContent>
      <TabsContent value="orders">
        <OrdersTabs />
      </TabsContent>
      <TabsContent value="support"></TabsContent>
    </Tabs>
  )
}
