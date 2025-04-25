'use client';

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import AccountTab from "./account/accountTab"
import { OrdersTabs } from "./orders/ordersTab";


export function UserTabs() {

  return (
    <Tabs defaultValue="account" className="w-full px-3 sm:max-w-xl mt-3">
      <TabsList className="grid w-full grid-cols-4 bg-card">
        <TabsTrigger className="cursor-pointer" value="account">Account</TabsTrigger>
        <TabsTrigger className="cursor-pointer" value="security">Security</TabsTrigger>
        <TabsTrigger className="cursor-pointer" value="orders">Orders</TabsTrigger>
        <TabsTrigger className="cursor-pointer" value="support">Support</TabsTrigger>
      </TabsList>
      <TabsContent value="account">
        <AccountTab />
      </TabsContent>
      <TabsContent value="security">

      </TabsContent>
      <TabsContent value="orders">
        <OrdersTabs />
      </TabsContent>
      <TabsContent value="support">

      </TabsContent>
    </Tabs>
  )
}
