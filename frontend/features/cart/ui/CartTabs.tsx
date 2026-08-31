'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@dorado/components'
import Cart from './Cart'
import SellCart from './SellCart'
import { Button } from '@dorado/components'
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
      <Drawer label="Cart"
        open={isCartOpen}
        setOpen={closeDrawer}
        surface="card"
        className="sm:!overflow-hidden"
      >
        <Button
          variant="tertiary"
          size="icon"
          className="hidden sm:flex"
          onClick={closeDrawer}
        >
          <X size={24} />
        </Button>
        <Tabs
          defaultValue={tab}
          onValueChange={(val) => setTab(val as 'buy' | 'sell')}
          className="w-full h-full"
        >
          {/* NOTE: "Buy" uses the SUBTLE indicator and "Sell" the primary one,
              so the two tabs have different active treatments. That predates
              this pass (tab-indicator-secondary vs tab-indicator-primary) and
              is preserved exactly rather than harmonised - it looks accidental
              and the call is Jacob's. */}
          <TabsList className="w-full">
            <TabsTrigger value="buy">
              Buy Cart {`(${items.length})`}
            </TabsTrigger>
            <TabsTrigger value="sell">
              Sell Cart {`(${sellItems.length})`}
            </TabsTrigger>
          </TabsList>
          <div className="h-px w-full bg-border -mt-[11px]" />

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
