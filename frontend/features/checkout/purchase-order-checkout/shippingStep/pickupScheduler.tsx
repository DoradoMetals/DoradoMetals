'use client'

import { Calendar } from '@dorado/components'
import { ScrollArea } from '@/shared/ui/base/scroll-area'
import { Button } from '@dorado/components'
import type { ShippingPickupTimes } from '@/features/shipping/types'
import { parseISO } from 'date-fns'
import { usePurchaseOrderCheckoutStore } from '@/shared/store/purchaseOrderCheckoutStore'

import {
  formatPickupDate,
  formatPickupDateShort,
  formatPickupTime,
} from '@/shared/utils/formatDates'
import { useEffect } from 'react'

type PickupSchedulerProps = {
  times: ShippingPickupTimes[]
}

export default function PickupScheduler({ times }: PickupSchedulerProps) {
  const pickup = usePurchaseOrderCheckoutStore((state) => state.data.pickup)
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)

  const today = new Date()

  const nextAvailable = times.find((t) => t.times.length > 0)

  const hasValidPickupDate = !!pickup?.date && times.some((t) => t.pickupDate === pickup.date)

  const selectedDateStr = hasValidPickupDate
    ? pickup!.date
    : nextAvailable?.pickupDate ?? times?.[0]?.pickupDate

  const selectedDay = times.find((t) => t.pickupDate === selectedDateStr)
  const availableSlots = selectedDay?.times ?? []

  const latestAvailableDate = times.length ? times[times.length - 1].pickupDate : undefined

  useEffect(() => {
    if (!selectedDateStr) return
    if (!pickup?.date) {
      setData({
        pickup: {
          name: pickup?.name ?? '',
          label: pickup?.label ?? '',
          date: selectedDateStr,
          time: undefined,
        },
      })
    }
  }, [pickup?.date, selectedDateStr, setData])

  // If we have no times at all, render nothing (or swap to a nicer empty state)
  if (!times?.length || !selectedDateStr) return null

  // NO CARRIER STRING HERE ANY MORE. This rendered its whole body behind
  // `pickup?.label === 'CONTACT_FEDEX_TO_SCHEDULE'` - a second copy of a
  // decision the parent had already made from the same string, so the browser
  // spelled a carrier's enum twice to draw one calendar. shippingStep gates on
  // the handoff's own `requires_schedule` flag; this is presentational and
  // renders what it is given (ruling 14).
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex max-sm:flex-col">
        <div className="flex items-center justify-center">
          <Calendar
            mode="single"
            selected={parseISO(selectedDateStr)}
            onSelect={(newDate) => {
              if (!newDate) return
              const iso = newDate.toISOString().split('T')[0]
              setData({
                pickup: {
                  ...pickup,
                  // Both spelled out rather than left to the spread: the
                  // component no longer gates its whole body on
                  // `pickup?.label === <a FedEx string>`, so TypeScript stops
                  // narrowing `pickup` to defined here and the schema wants
                  // both. Same values either way - the parent only renders this
                  // once a handoff is chosen.
                  label: pickup?.label ?? '',
                  name: pickup?.name ?? '',
                  date: iso,
                  time: undefined,
                },
              })
            }}
            className="p-2 sm:pe-5 bg-card"
            disabled={[
              {
                before: parseISO(new Date(today).toISOString().split('T')[0]),
                ...(latestAvailableDate
                  ? { after: parseISO(new Date(latestAvailableDate).toISOString().split('T')[0]) }
                  : {}),
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
            <p className="block sm:hidden text-center">{formatPickupDate(selectedDateStr)}</p>
            <p className="hidden sm:block text-center">
              {formatPickupDateShort(selectedDateStr)}
            </p>
          </div>

          <ScrollArea className="h-36 sm:h-64 w-full">
            <div className="grid gap-1.5 px-5 max-sm:grid-cols-2 py-2">
              {availableSlots.map((slot) => (
                <Button
                  key={slot}
                  variant={pickup?.time === slot ? 'primary' : 'secondary'}
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    setData({
                      pickup: {
                        ...pickup,
                        label: pickup?.label ?? '',
                        name: pickup?.name ?? '',
                        time: slot,
                      },
                    })
                  }
                >
                  {formatPickupTime(slot)}
                </Button>
              ))}

              {availableSlots.length === 0 && (
                <p className="text-center py-4 col-span-full">No time slots available</p>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
