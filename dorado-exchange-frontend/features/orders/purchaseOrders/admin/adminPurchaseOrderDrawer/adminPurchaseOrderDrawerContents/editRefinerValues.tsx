'use client'

import { Input } from '@/shared/ui/base/input'
import { cn } from '@/shared/utils/cn'

import {
  usePurchaseOrderRefinerMetals,
  useUpdateOrderRefinerSpotPrice,
  useUpdateRefinerFee,
  useUpdateRefinerPremium,
} from '@/features/orders/purchaseOrders/admin/queries'

import { assignScrapItemNames, PurchaseOrder, PurchaseOrderItem } from '@/types/purchase-order'
import { usePurchaseOrderMetals } from '@/features/orders/purchaseOrders/users/queries'

export default function RefinerValues({ order }: { order: PurchaseOrder }) {
  const { data: orderSpotPrices = [] } = usePurchaseOrderMetals(order.id)
  const { data: refinerSpotPrices = [] } = usePurchaseOrderRefinerMetals(order.id)

  const updateSpot = useUpdateOrderRefinerSpotPrice()
  const updatePremium = useUpdateRefinerPremium()
  const updateFee = useUpdateRefinerFee()

  function parsePercentToDecimal(raw: string): number | null {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const cleaned = trimmed.replace('%', '').replace(/\s+/g, '').replace(',', '.')
    const val = Number(cleaned)
    if (Number.isNaN(val)) return null
    return val / 100
  }

  const rawScrap = order.order_items.filter((it) => it.item_type === 'scrap' && it.scrap)
  const scrapItems = assignScrapItemNames(rawScrap)
  const bullionItems = order.order_items.filter((it) => it.item_type === 'product')
  const rows: PurchaseOrderItem[] = [...scrapItems, ...bullionItems]

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-4 w-full">
        <div className="w-full section-label">Update Refiner Values</div>
        <div className="flex flex-col gap-2 w-full">
          <div className="grid grid-cols-2 w-full gap-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
            {refinerSpotPrices.map((spot) => (
              <div key={spot.id} className="flex flex-col w-full">
                <div className="flex items-center justify-between w-full text-sm text-neutral-700">
                  {spot.type}
                </div>

                <div className="flex items-center gap-1 w-full">
                  <Input
                    type="number"
                    pattern="[0-9]*"
                    inputMode="decimal"
                    className={cn(
                      'input-floating-label-form no-spinner text-center w-full text-base h-8'
                    )}
                    defaultValue={
                      spot?.bid_spot ??
                      orderSpotPrices?.find((s) => s.type === spot.type)?.bid_spot ??
                      ''
                    }
                    onBlur={(e) =>
                      updateSpot.mutate({ spot: spot, updated_spot: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card raised-off-page overflow-hidden">
        <div className="flex items-center justify-between w-full px-3 py-2 text-xs tracking-widest text-neutral-600 bg-muted/40">
          <div>Item</div>
          <div className="text-right">Premium</div>
        </div>

        <div className="divide-y">
          {rows.map((item) => {
            const label =
              item.item_type === 'scrap'
                ? item.scrap?.name ?? item.scrap?.metal ?? 'Scrap'
                : item.product?.product_name ?? 'Bullion'

            return (
              <div
                key={item.id}
                className="flex items-center justify-between w-full items-center px-3 py-2 text-sm"
              >
                <div className="truncate">
                  <span className="text-neutral-800">{label}</span>
                </div>

                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="-9999"
                    className={cn('input-floating-label-form no-spinner text-right h-8')}
                    defaultValue={
                      item.refiner_premium != null ? (item.refiner_premium * 100).toString() : ''
                    }
                    disabled={updatePremium.isPending}
                    placeholder="e.g. 2.50"
                    onBlur={(e) => {
                      const refiner_premium = parsePercentToDecimal(e.target.value)
                      if (refiner_premium === null || !Number.isNaN(refiner_premium)) {
                        updatePremium.mutate({
                          purchase_order_id: order.id,
                          item_id: item.id,
                          refiner_premium,
                        })
                      }
                    }}
                  />
                  <span className="text-sm text-neutral-700 select-none">%</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card raised-off-page">
        <div className="flex items-center justify-between w-full px-3 py-2 text-xs tracking-widest text-neutral-600 bg-muted/40">
          <div>Update Refiner Fee</div>
          <div className="text-right">Amount</div>
        </div>

        <div className="flex items-center w-full items-center px-3 py-2 text-sm">
          <div className="flex items-center gap-1 w-full">
            <Input
              type="number"
              pattern="[0-9]*"
              inputMode="decimal"
              className={cn('input-floating-label-form no-spinner text-right w-full text-base h-8')}
              defaultValue={order.refiner_fee}
              disabled={updateFee.isPending}
              onBlur={(e) =>
                updateFee.mutate({
                  purchase_order_id: order.id,
                  refiner_fee: Number(e.target.value),
                })
              }
            />
          </div>
        </div>
      </div>
    </div>
  )
}
