'use client'

import * as React from 'react'
import { DayPicker } from 'react-day-picker'
import { ChevronLeft, ChevronRight } from '@dorado/icons'
import { cn } from '../cn'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('w-fit rounded-lg border border-border bg-card p-md', className)}
      classNames={{
        months: 'flex flex-col gap-sm',
        month: 'flex flex-col gap-sm',
        month_caption: 'flex h-6 items-center justify-center',
        caption_label: 'text-h5 text-foreground',
        nav: 'absolute inset-x-md flex items-center justify-between',
        button_previous:
          'relative z-10 inline-flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground hit-area focus-ring',
        button_next:
          'relative z-10 inline-flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground hit-area focus-ring',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex gap-3xs',
        weekday: 'h-5 flex-1 text-micro font-medium text-muted-foreground',
        weeks: 'flex flex-col gap-3xs',
        week: 'flex gap-3xs',
        day: 'flex-1 p-0',
        day_button:
          'flex min-h-(--control-md) min-w-(--control-md) w-full cursor-pointer items-center justify-center rounded-sm text-small text-foreground transition-colors hover:bg-accent focus-ring',
        today: '[&>button]:border [&>button]:border-border-strong [&>button]:font-medium',
        selected:
          '[&>button]:bg-primary [&>button]:font-medium [&>button]:text-primary-foreground [&>button:hover]:bg-primary',
        outside: '[&>button]:text-muted-foreground',
        disabled:
          '[&>button]:pointer-events-none [&>button]:text-muted-foreground [&>button]:opacity-40',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...rest }) =>
          orientation === 'left' ? (
            <ChevronLeft aria-hidden className="size-4" {...rest} />
          ) : (
            <ChevronRight aria-hidden className="size-4" {...rest} />
          ),
      }}
      {...props}
    />
  )
}
