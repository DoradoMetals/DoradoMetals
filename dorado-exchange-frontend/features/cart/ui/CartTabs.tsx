'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/base/tabs'
import Cart from './Cart'
import SellCart from './SellCart'
import { Button } from '@/shared/ui/base/button'
import { X } from 'lucide-react'
import { cartStore } from '@/shared/store/cartStore'
import { sellCartStore } from '@/shared/store/sellCartStore'
import { useCartTabStore } from '@/shared/store/cartTabsStore'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import Drawer from '@/shared/ui/base/drawer'

export function CartTabs() {
  const { tab, setTab } = useCartTabStore()

  const items = cartStore((state) => state.items)
  const sellItems = sellCartStore((state) => state.items)

  const { activeDrawer, closeDrawer } = useDrawerStore()
  const isCartOpen = activeDrawer === 'cart'

  const pathname = usePathname()

  useEffect(() => {
    closeDrawer()
  }, [pathname, closeDrawer])

  return (
    <div>
      <Drawer
        open={isCartOpen}
        setOpen={closeDrawer}
        className="bg-card border-t-1 border-border lg:border-none sm:!overflow-hidden"
      >
        <Button
          variant="ghost"
          size="icon"
          className="hidden sm:flex hover:bg-card p-3"
          onClick={closeDrawer}
        >
          <X size={24} className="text-neutral-900" />
        </Button>
        <Tabs
          defaultValue={tab}
          onValueChange={(val) => setTab(val as 'buy' | 'sell')}
          className="w-full h-full"
        >
          <TabsList className="w-full rounded-none bg-transparent px-0">
            <TabsTrigger value="buy" className="tab-indicator-secondary">
              Buy Cart {`(${items.length})`}
            </TabsTrigger>
            <TabsTrigger value="sell" className="tab-indicator-primary">
              Sell Cart {`(${sellItems.length})`}
            </TabsTrigger>
          </TabsList>
          <div className="separator-inset -mt-[11px]" />

          <TabsContent value="buy">
            <Cart />
          </TabsContent>
          <TabsContent value="sell">
            <SellCart />
          </TabsContent>
        </Tabs>
      </Drawer>
    </div>
  )
}
