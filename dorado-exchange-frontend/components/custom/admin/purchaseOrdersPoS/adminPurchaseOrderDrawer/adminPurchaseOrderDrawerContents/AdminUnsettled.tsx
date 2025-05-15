import PriceNumberFlow from '@/components/custom/products/PriceNumberFlow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  useAdminPurchaseOrderMetals,
  useLockOrderSpotPrices,
  useResetOrderScrapPercentage,
  useResetOrderSpotPrices,
  useUpdateOrderScrapPercentage,
  useUpdateOrderSpotPrice,
} from '@/lib/queries/admin/useAdminPurchaseOrders'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import { cn } from '@/lib/utils'
import { SpotPrice } from '@/types/metal'
import { payoutOptions } from '@/types/payout'
import { PurchaseOrderDrawerContentProps, statusConfig } from '@/types/purchase-order'
import { assignScrapItemNames } from '@/types/scrap'
import getPurchaseOrderBullionTotal from '@/utils/purchaseOrderBullionTotal'
import getPurchaseOrderScrapTotal from '@/utils/purchaseOrderScrapTotal'
import getPurchaseOrderTotal from '@/utils/purchaseOrderTotal'
import { Lock, RotateCcw, Unlock } from 'lucide-react'
import { useEffect, useMemo } from 'react'

export default function AdminUnsettledPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const { data: spotPrices = [] } = useSpotPrices()
  const { data: orderSpotPrices = [] } = useAdminPurchaseOrderMetals(order.id)
  const updateScrapPercentage = useUpdateOrderScrapPercentage()
  const resetScrapPercentage = useResetOrderScrapPercentage()
  const updateSpot = useUpdateOrderSpotPrice()
  const lockSpots = useLockOrderSpotPrices()
  const resetSpots = useResetOrderSpotPrices()

  const rawScrapItems = order.order_items.filter((item) => item.item_type === 'scrap' && item.scrap)
  const scrapItems = assignScrapItemNames(rawScrapItems.map((item) => item.scrap!))
  const bullionItems = order.order_items.filter((item) => item.item_type === 'product')
  const payoutMethod = payoutOptions.find((p) => p.method === order.payout?.method)
  const payoutFee = payoutMethod?.cost ?? 0

  const total = useMemo(() => {
    return getPurchaseOrderTotal(order, spotPrices, orderSpotPrices, payoutFee)
  }, [order, spotPrices, orderSpotPrices, payoutFee])

  const scrapTotal = useMemo(() => {
    return getPurchaseOrderScrapTotal(scrapItems, spotPrices, orderSpotPrices)
  }, [scrapItems, spotPrices, orderSpotPrices])

  const bullionTotal = useMemo(() => {
    return getPurchaseOrderBullionTotal(bullionItems, spotPrices, orderSpotPrices)
  }, [bullionItems, spotPrices, orderSpotPrices])

  const handleUpdateScrapPercentage = (spot: SpotPrice, scrap_percentage: number) => {
    updateScrapPercentage.mutate({ spot, scrap_percentage })
  }

  const handleResetScrapPercentage = (spot: SpotPrice) => {
    resetScrapPercentage.mutate({ spot })
  }

  const handleUpdateSpot = (spot: SpotPrice, updated_spot: number) => {
    updateSpot.mutate({ spot, updated_spot })
  }

  const handleLockSpots = (spots: SpotPrice[], purchase_order_id: string) => {
    console.log(purchase_order_id)
    lockSpots.mutate({ spots, purchase_order_id })
  }

  const handleResetSpots = (purchase_order_id: string) => {
    resetSpots.mutate({ purchase_order_id })
  }

  const spotsLocked = useMemo(() => {
    return orderSpotPrices.every((s) => typeof s.bid_spot === 'number')
  }, [orderSpotPrices])

  const config = statusConfig[order.purchase_order_status]
  return (
    <>
      <div className="flex w-full">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex w-full justify-between items-center mb-2">
              <div className="text-xs tracking-widest text-neutral-600">Order Spots</div>
              <Button
                variant="link"
                className={cn(config.text_color, 'p-0 font-normal text-sm h-4 hover:bg-transparent')}
                onClick={() =>
                  spotsLocked ? handleResetSpots(order.id) : handleLockSpots(spotPrices, order.id)
                }
                disabled={lockSpots.isPending || resetSpots.isPending}
              >
                {spotsLocked ? (
                  <div className="flex gap-1 items-center">
                    Unlock Spots
                    <Unlock size={16} />
                  </div>
                ) : (
                  <div className="flex gap-1 items-center">
                    Lock Spots
                    <Lock size={16} />
                  </div>
                )}
              </Button>
            </div>

            <div className="grid grid-cols-2 w-full gap-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
              {orderSpotPrices.map((spot) => (
                <div key={spot.id} className="flex flex-col w-full">
                  <div className="flex items-center justify-between w-full text-sm text-neutral-700">
                    {spot.type}
                  </div>

                  <div className="flex items-center gap-1 w-full">
                    <Input
                      type="number"
                      pattern="[0-9]*"
                      inputMode="decimal"
                      readOnly={!spotsLocked}
                      className={cn(
                        'input-floating-label-form no-spinner text-center w-full text-base h-8',
                        !spotsLocked && 'cursor-not-allowed'
                      )}
                      value={(
                        spot.bid_spot ??
                        spotPrices.find((s) => s.type === spot.type)?.bid_spot ??
                        ''
                      )}
                      onChange={(e) => handleUpdateSpot(spot, Number(e.target.value))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="separator-inset" />

          {scrapItems && (
            <div className="flex flex-col w-full gap-3">
              <div className="flex w-full justify-between items-center mb-2">
                <div className="text-xs tracking-widest text-neutral-600">Scrap</div>
                <div className="text-base text-neutral-800">
                  <PriceNumberFlow value={scrapTotal} />
                </div>
              </div>

              <div className="flex flex-col">
                <div className="flex w-full gap-4 items-center justify-between">
                  {orderSpotPrices.map((spot) => (
                    <div key={spot.id} className="flex flex-col w-full">
                      <div className="flex items-center justify-between w-full text-sm text-neutral-700">
                        {spot.type}
                        <Button
                          variant="ghost"
                          className="p-0 h-4"
                          onClick={() => handleResetScrapPercentage(spot)}
                        >
                          <RotateCcw size={16} className={config.text_color} />
                        </Button>
                      </div>

                      <div className="flex items-center gap-1 w-full">
                        <Input
                          type="number"
                          pattern="[0-9]*"
                          inputMode="decimal"
                          className="input-floating-label-form no-spinner text-center w-full text-base h-8"
                          value={
                            spot.scrap_percentage ??
                            spotPrices.find((s) => s.type === spot.type)?.scrap_percentage ??
                            ''
                          }
                          onChange={(e) =>
                            handleUpdateScrapPercentage(spot, Number(e.target.value))
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
