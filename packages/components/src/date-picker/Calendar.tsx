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
      className={cn('w-fit rounded-lg border border-border bg-card p-4', className)}
      classNames={{
        months: 'flex flex-col gap-3',
        month: 'flex flex-col gap-3',
        month_caption: 'flex h-6 items-center justify-center',
        caption_label: 'text-h5 font-semibold text-foreground',
        nav: 'absolute inset-x-4 flex items-center justify-between',
        button_previous:
          'z-10 inline-flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        button_next:
          'z-10 inline-flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex gap-0.5',
        weekday: 'h-5 flex-1 text-micro font-medium text-muted-foreground',
        weeks: 'flex flex-col gap-0.5',
        week: 'flex gap-0.5',
        day: 'flex-1 p-0',
        day_button:
          'flex size-10 w-full cursor-pointer items-center justify-center rounded-sm text-small text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
