'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@dorado/components'
import { Button } from '@dorado/components'
import { X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import type { Direction } from '@dorado/contracts'
import SaleItems from './SaleItems'
import PurchaseItems from './PurchaseItems'
import { useCheckoutItems } from '@/shared/store/checkoutItemsStore'
import { useCheckoutTab } from '@/shared/store/checkoutTabStore'
import { useDrawerStore } from '@/shared/store/drawerStore'
import Drawer from '@/shared/ui/base/drawer'

export function CheckoutDrawer() {
  const { direction, setDirection } = useCheckoutTab()

  const saleItems = useCheckoutItems((state) => state.sale)
  const purchaseItems = useCheckoutItems((state) => state.purchase)

  const { activeDrawer, closeDrawer } = useDrawerStore()
  const pathname = usePathname()

  useEffect(() => {
    closeDrawer()
  }, [pathname, closeDrawer])

  return (
    <div>
      <Drawer
        label="Checkout"
        open={activeDrawer === 'checkout'}
        setOpen={closeDrawer}
        surface="card"
        className="sm:!overflow-hidden"
      >
        <Button variant="tertiary" size="icon" className="hidden sm:flex" onClick={closeDrawer}>
          <X size={24} />
        </Button>
        <Tabs
          defaultValue={direction}
          onValueChange={(val) => setDirection(val as Direction)}
          className="w-full h-full"
        >
          {/* NOTE: "Buy" uses the SUBTLE indicator and "Sell" the primary one,
              so the two tabs have different active treatments. That predates
              this pass (tab-indicator-secondary vs tab-indicator-primary) and
              is preserved exactly rather than harmonised - it looks accidental
              and the call is Jacob's. */}
          <TabsList className="w-full">
            <TabsTrigger value="sale">Buying {`(${saleItems.length})`}</TabsTrigger>
            <TabsTrigger value="purchase">Selling {`(${purchaseItems.length})`}</TabsTrigger>
          </TabsList>
          <div className="h-px w-full bg-border -mt-[11px]" />

          <TabsContent value="sale">
            <SaleItems />
          </TabsContent>
          <TabsContent value="purchase">
            <PurchaseItems />
          </TabsContent>
        </Tabs>
      </Drawer>
    </div>
  )
}
