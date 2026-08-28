'use client'

import { Input } from '@/shared/ui/base/input'
import { cn } from '@/shared/utils/cn'

import { useRefinerMetals, useRefinerOrder } from '@/features/refiners/queries'
import { usePatchRefinerItem, usePatchRefinerOrder } from '@/features/refiners/queries'

import { assignScrapItemNames, PurchaseOrder, PurchaseOrderItem } from '@/features/orders/purchaseOrders/types'
import { useOrderSpots, nameSpots } from '@/features/orders/spots'
import { useSpotPrices } from '@/features/spots/queries'

export default function RefinerValues({ order }: { order: PurchaseOrder }) {
  const { data: orderSpotRows = [] } = useOrderSpots(order.id)
  // By the ORDER id - the key this component holds. The engagement row rides
  // along because its own id is what the PATCH addresses.
  const { data: refinerSpotRows = [] } = useRefinerMetals(order.id)
  const { data: refinerOrder } = useRefinerOrder(order.id)
  // Display composition, client-side: the verbatim rows carry metal_id; the
  // reference read supplies the names this screen shows and mutates by.
  const { data: spotPrices = [] } = useSpotPrices()
  const orderSpotPrices = nameSpots(orderSpotRows, spotPrices)
  const refinerSpotPrices = nameSpots(refinerSpotRows, spotPrices)

  // Everything here is refiner data: spots and fee are ENGAGEMENT facts on
  // refiners.orders, premium is per-line on refiners.items. Separate
  // instances keep the fee and premium inputs' own isPending.
  const updateSpot = usePatchRefinerOrder()
  const updatePremium = usePatchRefinerItem()
  const updateFee = usePatchRefinerOrder()

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
                  {spot.name}
                </div>

                <div className="flex items-center gap-1 w-full">
                  <Input
                    type="number"
                    pattern="[0-9]*"
                    inputMode="decimal"
                    className={cn(
                      'on-glass no-spinner text-center w-full text-base h-8'
                    )}
                    defaultValue={
                      spot?.bid ??
                      orderSpotPrices?.find((s) => s.name === spot.name)?.bid ??
                      ''
                    }
                    onBlur={(e) => {
                      if (!spot.name || !refinerOrder?.id) return
                      updateSpot.mutate({
                        refiner_order_id: refinerOrder.id,
                        order_id: order.id,
                        patch: { spots: [{ name: spot.name, bid: Number(e.target.value) }] },
                      })
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl on-glass overflow-hidden">
        <div className="flex items-center justify-between w-full px-3 py-2 text-xs tracking-widest text-neutral-600 bg-muted/40">
          <div>Item</div>
          <div className="text-right">Premium</div>
        </div>

        <div className="divide-y">
          {rows.map((item) => {
            const label =
              item.item_type === 'scrap'
                ? item.scrap?.name ?? item.scrap?.metal ?? 'Scrap'
                : item.product?.name ?? 'Bullion'

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
                    className={cn('on-glass no-spinner text-right h-8')}
                    defaultValue={
                      item.refiner_premium != null ? (item.refiner_premium * 100).toString() : ''
                    }
                    disabled={updatePremium.isPending}
                    placeholder="e.g. 2.50"
                    onBlur={(e) => {
                      const refiner_premium = parsePercentToDecimal(e.target.value)
                      if (refiner_premium === null || !Number.isNaN(refiner_premium)) {
                        updatePremium.mutate({
                          order_item_id: item.id,
                          order_id: order.id,
                          patch: { premium: refiner_premium },
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
      <div className="rounded-xl on-glass">
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
              className={cn('on-glass no-spinner text-right w-full text-base h-8')}
              defaultValue={order.totals?.refiner_fee ?? ''}
              disabled={updateFee.isPending}
              onBlur={(e) => {
                if (!refinerOrder?.id) return
                updateFee.mutate({
                  refiner_order_id: refinerOrder.id,
                  order_id: order.id,
                  patch: { fee: Number(e.target.value) },
                })
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
