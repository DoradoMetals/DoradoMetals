'use client'

import * as React from 'react'

import { cn } from '../cn'
import { ScrollArea } from '../scroll-area/ScrollArea'
import { Calendar, type CalendarProps } from './Calendar'
import { TimePicker, type TimeGroup } from './TimePicker'

export type DatePickerProps = CalendarProps & {
  timeGroups?: TimeGroup[]
  timeValue?: string | null
  onTimeChange?: (value: string) => void
  timeHeading?: React.ReactNode
  className?: string
}

export function DatePicker({
  timeGroups,
  timeValue,
  onTimeChange,
  timeHeading,
  className,
  ...calendar
}: DatePickerProps) {
  const withTimes = timeGroups != null && timeGroups.length > 0
  return (
    <div
      className={cn(
        'inline-flex flex-col rounded-xl border border-border bg-card max-sm:w-full sm:flex-row',
        className
      )}
    >
      <Calendar
        {...calendar}
        className="p-2"
        classNames={{
          caption_label: cn(
            'text-h5 font-semibold text-foreground',
            withTimes && 'sm:text-small sm:font-medium sm:text-muted-foreground sm:text-center'
          ),
          ...calendar.classNames,
        }}
      />
      {withTimes && (
        <div className="flex min-w-64 flex-col border-border max-sm:border-t sm:border-l">
          <ScrollArea className="max-h-72">
            <TimePicker
              bare
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
