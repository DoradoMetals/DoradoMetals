'use client'

import { Input } from '@dorado/components'
import { cn } from '@/shared/utils/cn'

import { useRefinerMetals, useRefinerOrder } from '@/features/refiners/queries'
import { usePatchRefinerItem, usePatchRefinerOrder } from '@/features/refiners/queries'

import { PurchaseOrderDrawerContentProps } from '@/features/orders/purchaseOrders/types'
import { assignScrapItemNames } from '@/features/orders/display'
import { useProducts } from '@/features/products/queries'
import { useRefinerItems } from '@/features/refiners/queries'
import { useSpotPrices } from '@/features/spots/queries'
import { useOrderSpots } from '@dorado/client'
import { nameOf, nameSpots } from '@/features/orders/display'

export default function RefinerValues({ view }: PurchaseOrderDrawerContentProps) {
  const { order, items } = view
  const { data: catalogue = [] } = useProducts()
  // THE REFINER'S PREMIUM IS refiners.items' (ruling 6), keyed by
  // item_id. The composed wire smeared it onto the customer's line as
  // `refiner_premium`.
  const { data: refinerItems = [] } = useRefinerItems(order.id)
  const { data: orderSpotRows = [] } = useOrderSpots(order.id)
  // By the ORDER id - the key this component holds. The engagement row rides
  // along because its own id is what the PATCH addresses.
  const { data: refinerSpotRows = [] } = useRefinerMetals(order.id)
  const { data: refinerOrder } = useRefinerOrder(order.id)
  // Display composition, client-side: the verbatim rows carry metal_id; the
  // reference read supplies the names this screen shows. The write keys by
  // metal_id now (D214 item 11) - RefinerSpotWrite takes the id, not a name
  // the server had to resolve back against metals.metals.
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

  // bullion_id is the discriminator; a scrap line's display name is derived,
  // a bullion line's comes from the catalogue.
  const scrapItems = assignScrapItemNames(
    items.filter((it) => it.bullion_id === null),
    (metal_id: string) => nameOf(spotPrices, metal_id)
  )
  const bullionItems = items.filter((it) => it.bullion_id !== null)
  const rows = [
    ...scrapItems.map((it) => ({ id: it.id, label: it.name })),
    ...bullionItems.map((it) => ({ id: it.id, label: nameOf(catalogue, it.bullion_id) ?? 'Bullion' })),
  ]
  const refinerPremiumOf = (item_id: string) =>
    refinerItems.find((r) => r.order_item_id === item_id)?.premium ?? null

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-4 w-full">
        <div className="w-full eyebrow">Update Refiner Values</div>
        <div className="flex flex-col gap-2 w-full">
          <div className="grid grid-cols-2 w-full gap-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
            {refinerSpotPrices.map((spot) => (
              <div key={spot.id} className="flex flex-col w-full">
                <small className="flex items-center justify-between w-full">
                  {spot.name}
                </small>

                <div className="flex items-center gap-1 w-full">
                  <Input
                    type="number"
                    pattern="[0-9]*"
                    inputClassName={cn('text-center h-8')}
                    defaultValue={
                      spot?.bid ??
                      orderSpotPrices?.find((s) => s.metal_id === spot.metal_id)?.bid ??
                      ''
                    }
                    onBlur={(e) => {
                      if (!spot.metal_id || !refinerOrder?.id) return
                      updateSpot.mutate({
                        refiner_order_id: refinerOrder.id,
                        order_id: order.id,
                        patch: { spots: [{ metal_id: spot.metal_id, bid: Number(e.target.value) }] },
                      })
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between w-full px-3 py-2 eyebrow bg-muted/40">
          <div>Item</div>
          <div className="text-right">Premium</div>
        </div>

        <div className="divide-y">
          {rows.map((item) => {
            const label = item.label ?? 'Item'

            return (
              <div
                key={item.id}
                className="flex items-center justify-between w-full items-center px-3 py-2"
              >
                <div className="truncate">
                  <span>{label}</span>
                </div>

                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    step="0.01"
                    min="-9999"
                    inputClassName={cn('text-right h-8')}
                    defaultValue={
                      refinerPremiumOf(item.id) != null
                        ? (refinerPremiumOf(item.id)! * 100).toString()
                        : ''
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
                  <small className="select-none">%</small>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="rounded-xl border border-border">
        <div className="flex items-center justify-between w-full px-3 py-2 eyebrow bg-muted/40">
          <div>Update Refiner Fee</div>
          <div className="text-right">Amount</div>
        </div>

        <div className="flex items-center w-full items-center px-3 py-2">
          <div className="flex items-center gap-1 w-full">
            <Input
              type="number"
              pattern="[0-9]*"
              inputClassName={cn('text-right h-8')}
              defaultValue={view.totals?.refiner_fee ?? ''}
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
