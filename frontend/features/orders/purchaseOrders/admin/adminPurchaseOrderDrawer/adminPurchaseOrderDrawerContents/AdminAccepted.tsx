import { Button } from '@/shared/ui/base/button'
import { Command, CommandItem, CommandList } from '@/shared/ui/base/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/base/popover'
import { cn } from '@/shared/utils/cn'
import { payoutOptions } from '@/features/payouts/types'
import { PurchaseOrderDrawerContentProps, statusConfig } from '@/features/orders/purchaseOrders/types'
import { CaretDownIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { useEditPayoutMethod } from '@/features/orders/purchaseOrders/admin/queries'

export default function AdminAcceptedPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const config = statusConfig[order.status ?? '']
  const [open, setOpen] = useState(false)
  const changePayoutMethod = useEditPayoutMethod()

  return (
    <div className="flex flex-col items-center justify-start sm:px-6 w-full h-full gap-5">
      <div className="flex flex-col gap-1 items-start w-full">
        <div className="text-sm text-neutral-600 tracking-wide">Change Payout Method</div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                'text-primary',
                'flex items-center justify-between gap-1 px-4 font-normal text-sm on-glass border-none h-9 w-full'
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
                      'text-primary',
                      'hover:bg-primary'
                    )}
                  >
                    <Icon size={16} className={cn('text-primary')} />
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
