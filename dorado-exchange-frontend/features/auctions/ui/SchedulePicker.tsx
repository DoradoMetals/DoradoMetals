'use client'

import { useMemo } from 'react'
import { format, parse, parseISO, isValid, startOfDay } from 'date-fns'

import { Calendar } from '@/shared/ui/base/calendar'
import { ScrollArea } from '@/shared/ui/base/scroll-area'
import { Button } from '@/shared/ui/base/button'
import { cn } from '@/shared/utils/cn'
import { formatPickupDateShort, formatPickupTime } from '@/shared/utils/formatDates'

type Props = {
  value: string | null
  onChange: (iso: string | null) => void
  minDate?: Date
}

function toLocalDateISO(d: Date) {
  return format(d, 'yyyy-MM-dd')
}

function buildTimes(stepMinutes = 30) {
  const times: string[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += stepMinutes) {
      const hh = String(h).padStart(2, '0')
      const mm = String(m).padStart(2, '0')
      times.push(`${hh}:${mm}:00`)
    }
  }
  return times
}

function buildLocalDateTime(dateISO: string, time: string) {
  const [y, mo, da] = dateISO.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, mo - 1, da, hh, mm, 0, 0)
}

function hasTimezoneSuffix(v: string) {
  return /([zZ]|[+\-]\d{2}:\d{2})$/.test(v)
}

function parseScheduled(value: string) {
  const d = hasTimezoneSuffix(value)
    ? parseISO(value)
    : parse(value, "yyyy-MM-dd'T'HH:mm:ss", new Date())

  return isValid(d) ? d : null
}

function toOffsetISO(d: Date) {
  return format(d, "yyyy-MM-dd'T'HH:mm:ssxxx")
}

export default function SchedulePicker({ value, onChange, minDate }: Props) {
  const today = useMemo(() => startOfDay(new Date()), [])
  const min = useMemo(() => startOfDay(minDate ?? today), [minDate, today])

  const allTimes = useMemo(() => buildTimes(30), [])

  const selected = useMemo(() => {
    if (!value) return null
    return parseScheduled(value)
  }, [value])

  const selectedDateISO = selected ? toLocalDateISO(selected) : null
  const selectedTime = selected
    ? `${String(selected.getHours()).padStart(2, '0')}:${String(selected.getMinutes()).padStart(
        2,
        '0'
      )}:00`
    : null

  const emit = (d: Date) => onChange(toOffsetISO(d))

  const selectDate = (newDate: Date | undefined) => {
    if (!newDate) return
    const dateISO = toLocalDateISO(newDate)
    const t = selectedTime ?? '12:00:00'
    emit(buildLocalDateTime(dateISO, t))
  }

  const selectTime = (t: string) => {
    const baseDateISO = selectedDateISO ?? toLocalDateISO(new Date())
    emit(buildLocalDateTime(baseDateISO, t))
  }

  return (
    <div className="rounded-lg border border-border on-glass">
      <div className="flex max-sm:flex-col">
        <div className="flex items-center justify-center h-full">
          <Calendar
            mode="single"
            selected={selected ?? undefined}
            onSelect={selectDate}
            className="p-2 sm:pe-5 bg-transparent"
            disabled={[{ before: min }]}
          />
        </div>

        <div className="w-full border-border">
          <div className="h-9 bg-transparent border-b border-border flex items-center justify-center px-5">
            <p className="text-sm text-neutral-700 text-center">
              {selectedDateISO ? formatPickupDateShort(selectedDateISO) : 'Select date'}
            </p>
          </div>

          <ScrollArea className="flex items-center justify-center h-36 sm:h-64 w-full py-2">
            <div className="flex grid gap-1.5 px-5 max-sm:grid-cols-2 py-2">
              {allTimes.map((t) => (
                <Button
                  key={t}
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    'w-full text-neutral-900 font-normal on-glass',
                    selectedTime === t && 'text-primary'
                  )}
                  onClick={() => selectTime(t)}
                >
                  {formatPickupTime(t)}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
