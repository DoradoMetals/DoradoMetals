'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Cart from './cart'
import SellCart from './sellCart'
import CartDrawer from '@/components/drawers/cartDrawer'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { cartStore } from '@/store/cartStore'
import { sellCartStore } from '@/store/sellCartStore'
import { useCartTabStore } from '@/store/cartTabsStore'
import { useDrawerStore } from '@/store/drawerStore'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

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
      <CartDrawer open={isCartOpen} setOpen={closeDrawer}>
        <div className="h-full bg-card border-t-1 border-border lg:border-none flex flex-col p-2">
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
            <TabsList className="w-full rounded-none bg-transparent mt-10 px-0">
              <TabsTrigger value="buy" className="tab-indicator-secondary">
                Buy {`(${items.length})`}
              </TabsTrigger>
              <TabsTrigger value="sell" className="tab-indicator-primary">
                Sell {`(${sellItems.length})`}
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
        </div>
      </CartDrawer>
    </div>
  )
}
