import PriceNumberFlow from '@/components/custom/products/PriceNumberFlow'
import { Button } from '@/components/ui/button'
import { Command, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  useEditPayoutMethod,
  usePurchaseOrderRefinerMetals,
  useUpdateOrderRefinerSpotPrice,
  useUpdateRefinerPremium,
} from '@/lib/queries/admin/useAdminPurchaseOrders'
import { usePurchaseOrderMetals } from '@/lib/queries/usePurchaseOrders'
import { cn } from '@/lib/utils'
import { SpotPrice } from '@/types/metal'
import { payoutOptions } from '@/types/payout'
import {
  assignScrapItemNames,
  PurchaseOrderDrawerContentProps,
  PurchaseOrderItem,
  statusConfig,
} from '@/types/purchase-order'
import { CaretDownIcon } from '@phosphor-icons/react'
import { useState } from 'react'

export default function AdminAcceptedPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const config = statusConfig[order.purchase_order_status]

  const [open, setOpen] = useState(false)
  const changePayoutMethod = useEditPayoutMethod()

  const { data: orderSpotPrices = [] } = usePurchaseOrderMetals(order.id)
  const { data: refinerSpotPrices = [] } = usePurchaseOrderRefinerMetals(order.id)
  const updateSpot = useUpdateOrderRefinerSpotPrice()

  const handleUpdateSpot = (spot: SpotPrice, updated_spot: number) => {
    updateSpot.mutate({ spot, updated_spot })
  }
  const updatePremium = useUpdateRefinerPremium()

  const handleUpdatePremium = (item_id: string, raw: string) => {
    const trimmed = raw.trim()
    const refiner_premium = trimmed === '' ? null : Number(trimmed)
    if (refiner_premium === null || !Number.isNaN(refiner_premium)) {
      updatePremium.mutate({
        purchase_order_id: order.id,
        item_id,
        refiner_premium,
      })
    }
  }

  return (
    <div className="flex flex-col items-center justify-center sm:px-6 w-full h-full gap-5">
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm text-neutral-700 mb-6 text-left">
          Customer has accepted our offer of{' '}
          <span className="text-base text-neutral-900 font-semibold">
            <PriceNumberFlow value={order.total_price ?? 0} />
          </span>
          . Don't forget to update the refiner spots and percentages! Once you are ready, please
          move the order to Payment Processing.
        </p>
      </div>
      <div className="separator-inset" />

      <div className="flex w-full">
        <div className="flex flex-col gap-4 w-full">
          <div className="w-full section-label">Update Refiner Spots</div>
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
                      onBlur={(e) => handleUpdateSpot(spot, Number(e.target.value))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="separator-inset" />

      <div className="flex w-full">
        <div className="flex flex-col gap-4 w-full">
          <div className="w-full section-label">Update Item Premiums</div>

          {(() => {
            const rawScrap = order.order_items.filter((it) => it.item_type === 'scrap' && it.scrap)
            const scrapItems = assignScrapItemNames(rawScrap)
            const bullionItems = order.order_items.filter((it) => it.item_type === 'product')

            const rows: PurchaseOrderItem[] = [...scrapItems, ...bullionItems]

            return (
              <div className="rounded-xl border border-border bg-card raised-off-page overflow-hidden">
                <div className="grid grid-cols-[1fr_140px] items-center px-3 py-2 text-xs tracking-widest text-neutral-600 bg-muted/40">
                  <div>Item</div>
                  <div className="text-right">Premium (%)</div>
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
                        className="grid grid-cols-[1fr_140px] items-center px-3 py-2 text-sm"
                      >
                        <div className="truncate">
                          <span className="text-neutral-800">{label}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="-9999"
                            className={cn('input-floating-label-form no-spinner text-right h-8')}
                            defaultValue={
                              item.refiner_premium
                            }
                            placeholder="e.g. 2.50"
                            onBlur={(e) => handleUpdatePremium(item.id, e.target.value)}
                          />
                          <span className="text-xs text-neutral-600 select-none">%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      <div className="flex flex-col gap-1 items-start w-full">
        <div className="text-sm text-neutral-600 tracking-wide">Change Payout Method</div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                config.text_color,
                'flex items-center justify-between gap-1 px-4 font-normal text-sm bg-card raised-off-page border-none h-9 w-full'
              )}
            >
              {payoutOptions.find((m) => m.method === order.payout.method)?.label}
              <CaretDownIcon size={20} />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="p-0 w-48 z-70"
            align="end"
            side="bottom"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Command className="bg-card">
              <CommandList>
                {payoutOptions.map(({ label, method, icon: Icon }) => (
                  <CommandItem
                    key={label}
                    onSelect={() => {
                      changePayoutMethod.mutate({
                        purchase_order: order,
                        payout_method: method,
                      })
                      setOpen(false)
                    }}
                    className={cn(
                      'group h-9 px-3 flex items-center gap-2 transition-colors duration-150 cursor-pointer',
                      config.text_color,
                      config.hover_background_color
                    )}
                  >
                    <Icon size={16} className={cn(config.text_color)} />
                    <span className="transition-colors">{label}</span>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
