'use client'

import { ScrollArea, Button, Calendar } from '@dorado/components'

import type { CarrierPickupWindow, CheckoutView } from '@dorado/contracts'
import { parseISO } from 'date-fns'
import { usePatchCheckout } from '@/features/checkout/queries'

import {
  formatPickupDate,
  formatPickupDateShort,
  formatPickupTime,
} from '@/shared/utils/formatDates'

// THE DEFAULT DATE IS DERIVED, NOT PATCHED BY AN EFFECT.
//
// This used to run an effect that PATCHed `pickup_date` to the first available
// day the moment the calendar rendered - a write nobody asked for, from a
// render rather than a click, which also meant the row said "scheduled" before
// the customer had scheduled anything. The calendar now SHOWS the first
// available day while `row.pickup_date` is null and writes only when a day or
// a slot is actually clicked; `row.requires_schedule` plus the two columns are
// what `missing` keys on, so an unscheduled pickup blocks the step honestly.
export default function PickupScheduler({
  times,
  row,
}: {
  times: CarrierPickupWindow[]
  row?: CheckoutView
}) {
  const patchCheckout = usePatchCheckout('purchase')

  const today = new Date()
  const nextAvailable = times.find((t) => t.times.length > 0)
  const stored = row?.pickup_date
  const shownDate =
    stored && times.some((t) => t.pickupDate === stored)
      ? stored
      : nextAvailable?.pickupDate ?? times[0]?.pickupDate

  if (!times.length || !shownDate) return null

  const availableSlots = times.find((t) => t.pickupDate === shownDate)?.times ?? []
  const latestAvailableDate = times[times.length - 1]?.pickupDate

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex max-sm:flex-col">
        <div className="flex items-center justify-center">
          <Calendar
            mode="single"
            selected={parseISO(shownDate)}
            onSelect={(newDate) => {
              if (!newDate) return
              const iso = newDate.toISOString().split('T')[0]
              patchCheckout.mutate({ pickup_date: iso, pickup_time: null })
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
            <p className="block sm:hidden text-center">{formatPickupDate(shownDate)}</p>
            <p className="hidden sm:block text-center">{formatPickupDateShort(shownDate)}</p>
          </div>

          <ScrollArea className="h-36 sm:h-64 w-full">
            <div className="grid gap-1.5 px-5 max-sm:grid-cols-2 py-2">
              {availableSlots.map((slot) => (
                <Button
                  key={slot}
                  variant={row?.pickup_time === slot ? 'primary' : 'secondary'}
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    patchCheckout.mutate({ pickup_date: shownDate, pickup_time: slot })
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
