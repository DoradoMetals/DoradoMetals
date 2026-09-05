'use client'

import { Calendar, ScrollArea, Button } from '@dorado/components'
import type { CarrierPickupWindow, FulfillmentView } from '@dorado/contracts'
import { parseISO } from 'date-fns'
import { usePatchFulfillment } from '@/shared/hooks/checkout/queries'

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
// available day while the parcel's `pickup_date` is null and writes only when a
// day or a slot is actually clicked; the draft's own `missing` names
// `pickup_date`/`pickup_time` exactly when the chosen handoff needs them, so an
// unscheduled pickup blocks the step honestly.
//
// THE SLOT IS THE PARCEL'S (rulings 69/70, migration 128) - it was two columns
// of the checkout row until then.
export default function PickupScheduler({
  times,
  fulfillment,
}: {
  times: CarrierPickupWindow[]
  fulfillment?: FulfillmentView
}) {
  const patchFulfillment = usePatchFulfillment()
  const patchSlot = (shipment: { pickup_date?: string | null; pickup_time?: string | null }) => {
    if (fulfillment) {
      patchFulfillment.mutate({ fulfillment_id: fulfillment.fulfillment.id, shipment })
    }
  }

  const today = new Date()
  const nextAvailable = times.find((t) => t.times.length > 0)
  const stored = fulfillment?.parcel?.pickup_date
  const shownDate =
    stored && times.some((t) => t.pickupDate === stored)
      ? stored
      : (nextAvailable?.pickupDate ?? times[0]?.pickupDate)

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
              patchSlot({ pickup_date: iso, pickup_time: null })
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
                  variant={fulfillment?.parcel?.pickup_time === slot ? 'primary' : 'secondary'}
                  size="sm"
                  className="w-full"
                  onClick={() => patchSlot({ pickup_date: shownDate, pickup_time: slot })}
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
