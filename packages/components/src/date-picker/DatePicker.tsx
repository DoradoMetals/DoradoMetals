'use client'

import * as React from 'react'

import { cn } from '../cn'
import { ScrollArea } from '../scroll-area/ScrollArea'
import { Select } from '../select/Select'
import { Calendar, type CalendarProps } from './Calendar'
import { TimePicker, type TimeGroup } from './TimePicker'

export type DatePickerLayout = 'stacked' | 'sideBySide' | 'slim'

export type DatePickerProps = CalendarProps & {
  layout?: DatePickerLayout
  timeGroups?: TimeGroup[]
  timeValue?: string | null
  onTimeChange?: (value: string) => void
  timeHeading?: React.ReactNode
  className?: string
}

export function DatePicker({
  layout = 'sideBySide',
  timeGroups,
  timeValue,
  onTimeChange,
  timeHeading,
  className,
  ...calendar
}: DatePickerProps) {
  const withTimes = timeGroups != null && timeGroups.length > 0
  const slim = layout === 'slim'
  const stacked = layout === 'stacked'

  const slots = React.useMemo(
    () =>
      (timeGroups ?? []).flatMap((g) =>
        g.slots
          .filter((s) => s.available !== false)
          .map((s) => ({ value: s.value, label: s.label }))
      ),
    [timeGroups]
  )

  return (
    <div
      data-layout={layout}
      className={cn(
        'inline-flex flex-col rounded-xl border border-border bg-card max-sm:w-full',
        !slim && !stacked && 'sm:flex-row',
        className
      )}
    >
      <Calendar
        {...calendar}
        className="p-2"
        classNames={{
          caption_label: cn(
            'text-h5 font-semibold text-foreground',
            withTimes &&
              !slim &&
              !stacked &&
              'sm:text-small sm:font-medium sm:text-muted-foreground sm:text-center'
          ),
          ...calendar.classNames,
        }}
      />
      {withTimes && slim && (
        <div className="border-t border-border p-2">
          <Select
            label={timeHeading ?? 'Time'}
            placeholder="Select a time"
            items={slots}
            value={timeValue ?? undefined}
            onValueChange={(v) => onTimeChange?.(v)}
          />
        </div>
      )}
      {withTimes && !slim && (
        <div
          className={cn(
            'flex flex-col border-border',
            stacked ? 'border-t' : 'min-w-64 max-sm:border-t sm:border-l'
          )}
        >
          <ScrollArea className={stacked ? undefined : 'max-h-72'}>
            <TimePicker
              bare
              columns={stacked ? 3 : 2}
              heading={timeHeading}
              groups={timeGroups}
              value={timeValue ?? null}
              onValueChange={(v) => onTimeChange?.(v)}
            />
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
