import { Button } from '@/components/ui/button'
import { Command, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useEditPayoutMethod } from '@/lib/queries/admin/useAdminPurchaseOrders'
import { cn } from '@/lib/utils'
import { payoutOptions } from '@/types/payout'
import { PurchaseOrderDrawerContentProps, statusConfig } from '@/types/purchase-order'
import { CaretDownIcon } from '@phosphor-icons/react'
import { useState } from 'react'

export default function AdminAcceptedPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const config = statusConfig[order.purchase_order_status]

  const [open, setOpen] = useState(false)
  const changePayoutMethod = useEditPayoutMethod()

  return (
    <div className="flex flex-col items-center justify-center sm:px-6 w-full h-full gap-5">
      <div className="flex flex-col items-center gap-3">
        <config.icon className={cn(config.text_color, 'mb-6')} size={128} strokeWidth={1.5} />
        <h2 className="text-2xl text-neutral-800 mb-2">Customer Accepted!</h2>

        <p className="text-sm text-neutral-700 mb-6 lg:px-14 text-center">
          Customer has an accepted an offer total of ${order.total_price?.toFixed(2)}. Once you are
          ready, please move the order to Payment Processing.
        </p>
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
              {order.payout.method}
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
                {payoutOptions.map(({ method, icon: Icon }) => (
                  <CommandItem
                    key={method}
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
                    <span className="transition-colors">{method}</span>
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
