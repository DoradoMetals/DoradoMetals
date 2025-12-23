'use client'

import { Calendar } from '@/shared/ui/base/calendar'
import { ScrollArea } from '@/shared/ui/base/scroll-area'
import { Button } from '@/shared/ui/base/button'
import { FedexPickupTimes } from '@/types/fedex'
import { parseISO } from 'date-fns'
import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import { cn } from '@/shared/utils/cn'
import { formatPickupDate, formatPickupDateShort, formatPickupTime } from '@/shared/utils/formatDates'
import { useEffect } from 'react'

type PickupSchedulerProps = {
  times: FedexPickupTimes[]
}

export default function PickupScheduler({ times }: PickupSchedulerProps) {
  const pickup = usePurchaseOrderCheckoutStore((state) => state.data.pickup)
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)

  const today = new Date()

  const nextAvailable = times.find((t) => t.times.length > 0)

  const hasValidPickupDate = pickup?.date && times.some((t) => t.pickupDate === pickup.date)

  const selectedDateStr = hasValidPickupDate
    ? pickup?.date
    : nextAvailable?.pickupDate ?? times[0].pickupDate

  const selectedDay = times.find((t) => t.pickupDate === selectedDateStr)
  const availableSlots = selectedDay?.times ?? []
  const latestAvailableDate = times.length ? times[times.length - 1].pickupDate : today

  useEffect(() => {
    if (!pickup?.date && selectedDateStr) {
      setData({
        pickup: {
          name: pickup?.name ?? '',
          label: pickup?.label ?? '',
          date: selectedDateStr,
          time: undefined,
        },
      })
    }
  }, [pickup?.date, selectedDateStr])

  return (
    <div>
      {pickup?.label === 'CONTACT_FEDEX_TO_SCHEDULE' && (
        <div className="rounded-lg border border-border bg-card raised-off-page">
          <div className="flex max-sm:flex-col">
            <div className="flex items-center justify-center">
              <Calendar
                mode="single"
                selected={parseISO(selectedDateStr ?? new Date().toISOString().split('T')[0])}
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
                    before: parseISO(new Date(today).toISOString().split('T')[0]),
                    after: parseISO(new Date(latestAvailableDate).toISOString().split('T')[0]),
                  },
                  (date) => {
                    const iso = date.toISOString().split('T')[0]
                    return !times.some((t) => t.pickupDate === iso)
                  },
                ]}
              />
            </div>

            <div className="w-full border-border border-t sm:border-t-0 sm:border-s sm:w-40">
              <div className="h-9 bg-card border-b border-border flex items-center justify-center px-5">
                <p className="block sm:hidden text-sm text-neutral-700 text-center">
                  {formatPickupDate(selectedDateStr)}
                </p>
                <p className="hidden sm:block text-sm text-neutral-700 text-center">
                  {formatPickupDateShort(selectedDateStr)}
                </p>
              </div>

              <ScrollArea className="h-36 sm:h-64 w-full">
                <div className="grid gap-1.5 px-5 max-sm:grid-cols-2 py-2">
                  {availableSlots.map((slot) => (
                    <Button
                      key={slot}
                      variant="outline"
                      size="sm"
                      className={cn(
                        'w-full text-neutral-700 font-normal raised-off-page bg-card hover:bg-card',
                        pickup?.time === slot && 'text-primary'
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
