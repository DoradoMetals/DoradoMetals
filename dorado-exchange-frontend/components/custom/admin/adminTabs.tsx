'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ScrapCards from './scrapPoS/ScrapCards'
import ProductsInventory from './productsPoS/productsInventory'
import AdminPurchaseOrders from './purchaseOrdersPoS/AdminPurchaseOrders'
import { UsersPage } from './usersPoS/usersPage'
import AdminSalesOrders from './salesOrdersPoS/AdminSalesOrders'
import { ClipboardTextIcon, CoinsIcon, CurrencyDollarIcon, GearIcon } from '@phosphor-icons/react'
import { useAdminSalesOrders } from '@/lib/queries/admin/useAdminSalesOrders'
import { useAdminPurchaseOrders } from '@/lib/queries/admin/useAdminPurchaseOrders'
import getPrimaryIconStroke from '@/utils/getPrimaryIconStroke'
import { useGetInventory } from '@/lib/queries/admin/useAdminProducts'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import PriceNumberFlow from '../products/PriceNumberFlow'
import { getInventoryValue } from './productsPoS/inventoryPrices'

export function AdminTabs() {
  const { data: purchaseOrders = [] } = useAdminPurchaseOrders()
  const { data: salesOrders = [] } = useAdminSalesOrders()
  const { data: productsInventory } = useGetInventory()
  const { data: spotPrices = [] } = useSpotPrices()

  return (
    <>
      <div className="flex w-full mt-4 lg:mt-10 mb-8">
        <Tabs defaultValue="inventory" className="flex w-full items-center justify-center">
          <TabsList className="justify-center grid grid-cols-3 w-full max-w-4xl bg-transparent px-0">
            <TabsTrigger className="tab-indicator-primary" value="inventory">
              Inventory
            </TabsTrigger>
            <TabsTrigger className="tab-indicator-primary" value="orders">
              Orders
            </TabsTrigger>
            <TabsTrigger className="tab-indicator-primary" value="users">
              Users
            </TabsTrigger>
          </TabsList>
          <div className="separator-inset -mt-[11px] max-w-4xl" />

          <TabsContent value="inventory" className="max-w-4xl">
            <Tabs defaultValue="products" className="mt-3">
              <TabsList className="justify-center h-auto w-full gap-2 bg-transparent px-0">
                <TabsTrigger
                  value="products"
                  className="cursor-pointer bg-background data-[state=active]:bg-card rounded-lg p-2 sm:p-4 raised-off-page w-full h-auto"
                >
                  <div className="flex items-start sm:items-center justify-between w-full">
                    <CoinsIcon
                      className="hidden sm:flex"
                      size={64}
                      color={getPrimaryIconStroke()}
                    />
                    <CoinsIcon
                      className="sm:hidden"
                      size={48}
                      color={getPrimaryIconStroke()}
                    />

                    <div className="flex flex-col items-end">
                      <div className="text-lg sm:text-2xl text-neutral-800">
                        <PriceNumberFlow
                          value={
                            productsInventory
                              ? getInventoryValue({
                                  productInventory: productsInventory,
                                  spots: spotPrices,
                                })
                              : 0
                          }
                        />
                      </div>
                      <div className="text-xs sm:text-sm text-neutral-600 ">Products</div>
                    </div>
                  </div>
                </TabsTrigger>
                <TabsTrigger
                  value="scrap"
                  className="cursor-pointer bg-background data-[state=active]:bg-card rounded-lg p-2 sm:p-4 raised-off-page w-full h-auto"
                >
                  <div className="flex items-start sm:items-center justify-between w-full">
                    <GearIcon
                      className="hidden sm:flex"
                      size={64}
                      color={getPrimaryIconStroke()}
                    />
                    <GearIcon
                      className="sm:hidden"
                      size={48}
                      color={getPrimaryIconStroke()}
                    />
                    <div className="flex flex-col items-end">
                      <div className="text-lg sm:text-2xl text-neutral-800">
                        <PriceNumberFlow value={0} />
                      </div>
                      <div className="text-xs sm:text-sm text-neutral-600">Scrap</div>
                    </div>
                  </div>
                </TabsTrigger>
              </TabsList>
              <TabsContent value="products" className="">
                <ProductsInventory />
              </TabsContent>
              <TabsContent value="scrap" className="space-y-4 justify-center">
                <ScrapCards />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="orders" className="max-w-4xl">
            <Tabs defaultValue="purchase-orders" className="mt-3 flex justify-center items-center">
              <div className="flex flex-col w-full justify-center gap-3">
                <TabsList className="justify-center h-auto w-full gap-2 rounded-none bg-transparent px-0">
                  <TabsTrigger
                    value="purchase-orders"
                    className="cursor-pointer bg-background data-[state=active]:bg-card rounded-lg p-2 sm:p-4 raised-off-page w-full h-auto"
                  >
                    <div className="flex items-start sm:items-center justify-between w-full">
                      <ClipboardTextIcon
                        className="hidden sm:flex"
                        size={64}
                        color={getPrimaryIconStroke()}
                      />
                      <ClipboardTextIcon
                        className="sm:hidden"
                        size={48}
                        color={getPrimaryIconStroke()}
                      />

                      <div className="flex flex-col items-end">
                        <div className="text-lg sm:text-2xl text-neutral-800">
                          {purchaseOrders.length}
                        </div>
                        <div className="text-xs sm:text-sm text-neutral-600 ">Purchase Orders</div>
                      </div>
                    </div>
                  </TabsTrigger>
                  <TabsTrigger
                    value="sales-orders"
                    className="cursor-pointer bg-background data-[state=active]:bg-card rounded-lg p-2 sm:p-4 raised-off-page w-full h-auto"
                  >
                    <div className="flex items-start sm:items-center justify-between w-full">
                      <CurrencyDollarIcon
                        className="hidden sm:flex"
                        size={64}
                        color={getPrimaryIconStroke()}
                      />
                      <CurrencyDollarIcon
                        className="sm:hidden"
                        size={48}
                        color={getPrimaryIconStroke()}
                      />
                      <div className="flex flex-col items-end">
                        <div className="text-lg sm:text-2xl text-neutral-800">
                          {salesOrders.length}
                        </div>
                        <div className="text-xs sm:text-sm text-neutral-600">Sales Orders</div>
                      </div>
                    </div>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="purchase-orders">
                  <AdminPurchaseOrders />
                </TabsContent>
                <TabsContent value="sales-orders">
                  <AdminSalesOrders />
                </TabsContent>
              </div>
            </Tabs>
          </TabsContent>

          <TabsContent value="users" className="flex flex-col gap-2 max-w-4xl">
            <UsersPage />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
