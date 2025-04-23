'use client'

import { Calendar } from '@/components/ui/calendar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { FedexPickupTimes } from '@/types/shipping'
import { format, parseISO } from 'date-fns'
import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import { cn } from '@/lib/utils'
import { formatPickupDate, formatPickupTime } from '@/utils/dateFormatting'

type PickupSchedulerProps = {
  times: FedexPickupTimes[]
}

export default function PickupScheduler({ times }: PickupSchedulerProps) {
  console.log('rendered')
  const todayStr = new Date().toISOString().split('T')[0]

  const pickup = usePurchaseOrderCheckoutStore((state) => state.data.pickup)
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)

  const selectedDateStr = pickup?.date ?? times[0]?.pickupDate ?? todayStr

  const selectedDay = times.find((t) => t.pickupDate === selectedDateStr)
  const availableSlots = selectedDay?.times ?? []

  const latestAvailableDateStr = times.length ? times[times.length - 1].pickupDate : todayStr

  return (
    <div>
      {pickup?.label === 'CONTACT_FEDEX_TO_SCHEDULE' && (
        <div className="rounded-lg border border-border bg-card">
          <div className="flex max-sm:flex-col">
            {/* Calendar */}
            <div className="flex items-center justify-center">
              <Calendar
                mode="single"
                selected={parseISO(selectedDateStr)}
                onSelect={(newDate) => {
                  if (newDate) {
                    const iso = newDate.toISOString().split('T')[0]
                    setData({
                      pickup: {
                        ...pickup,
                        label: pickup?.label ?? '',
                        date: iso,
                        time: undefined,
                      },
                    })
                  }
                }}
                className="p-2 sm:pe-5 bg-card"
                disabled={[
                  {
                    before: parseISO(todayStr),
                    after: parseISO(latestAvailableDateStr),
                  },
                  (date) => {
                    const iso = date.toISOString().split('T')[0]
                    return !times.some((t) => t.pickupDate === iso)
                  },
                ]}
              />
            </div>

            <div className="w-full border-border border-t sm:border-t-0 sm:border-s sm:w-40">
              {/* Sticky Date Header (outside scroll) */}
              <div className="h-9 bg-card border-b border-border flex items-center justify-center px-5">
                <p className="block sm:hidden text-sm text-neutral-700 text-center">
                  {formatPickupDate(selectedDateStr)}
                </p>
              </div>

              {/* Scrollable Slot List */}
              <ScrollArea className="h-36 sm:h-64 w-full">
                <div className="grid gap-1.5 px-5 max-sm:grid-cols-2 py-2">
                  {availableSlots.map((slot) => (
                    <Button
                      key={slot}
                      variant="outline"
                      size="sm"
                      className={cn(
                        'w-full text-neutral-700 border-border font-normal hover:bg-background hover:text-primary',
                        pickup?.time === slot && 'border-primary text-primary'
                      )}
                      onClick={() =>
                        setData({
                          pickup: {
                            ...pickup,
                            label: pickup?.label ?? '',
                            time: slot,
                          },
                        })
                      }
                    >
                      {formatPickupTime(slot)}
                    </Button>
                  ))}

                  {availableSlots.length === 0 && (
                    <div className="text-xs text-center text-muted-foreground py-4 col-span-full">
                      No time slots available
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
