'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import * as React from 'react'
import { DayPicker } from 'react-day-picker'

import { cn } from '@/shared/utils/cn'
import { buttonVariants } from '@/shared/ui/base/button'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  startMonth,
  endMonth,
  showOutsideDays = true,
  components: userComponents,
  ...props
}: CalendarProps) {
  const defaultClassNames = {
    months: 'relative flex flex-col sm:flex-row gap-4',
    month: 'w-full',
    month_caption: 'relative mx-10 mb-1 flex h-9 items-center justify-center z-20',
    caption_label: 'text-sm font-medium',
    nav: 'absolute top-0 flex w-full justify-between z-10',
    button_previous: cn(
      buttonVariants({ variant: 'tertiary' }),
      'size-9 text-muted-foreground/80 hover:text-foreground hover:bg-transparent p-0'
    ),
    button_next: cn(
      buttonVariants({ variant: 'tertiary' }),
      'size-9 text-muted-foreground/80 hover:text-foreground hover:bg-transparent p-0'
    ),
    weekday: 'size-9 p-0 text-xs font-medium text-muted-foreground/80',

    /* TWO STATES THAT THE PALETTE FLIP COLLAPSED. Same root cause as D95 - a
       STATE token and a REST token becoming the same colour - but neither is
       white-on-white, so no white-on-white scan would ever have found them.
       NOTE: comments cannot live inside the template literal below; every word
       in it is emitted as a class name, and a backtick would end the string.

       HOVER did nothing. `hover:bg-transparent` sat after `hover:bg-accent` and
       cancelled it, and `hover:text-primary` moved the text from #f6f7f9 to
       #fafafa. A day cell had no hover affordance at all. Now: the accent fill
       stands, and the text stays `--foreground`.

       SELECTED was indistinguishable from unselected: `bg-transparent` plus
       `text-primary`, against a rest state of `text-foreground`. On a date
       picker, "which day did I pick" is the entire point of the control.
       Selected is now the filled primary surface (ruling 19's primary
       selection), and the range-middle keeps the quieter accent fill with
       `--foreground` text so the two read as different depths of the same
       selection. */
    day_button: `relative flex size-8 items-center justify-center whitespace-nowrap rounded-lg p-0 text-foreground outline-offset-2 cursor-pointer 


      focus:outline-none 
      focus-visible:z-10 hover:bg-accent 
      focus-visible:outline focus-visible:outline-2 
      focus-visible:outline-ring/70 

      hover:text-foreground

      group-[[data-selected]:not(.range-middle)]:[transition-property:color,background-color,border-radius,box-shadow] 
      group-[[data-selected]:not(.range-middle)]:duration-150 
      
      group-data-[selected]:bg-primary
      group-data-[selected]:text-primary-foreground
      group-data-[selected]:group-[.range-middle]:bg-accent
      group-data-[selected]:group-[.range-middle]:text-foreground 
      
      group-data-[disabled]:pointer-events-none 
      group-data-[disabled]:cursor-not-allowed 
      group-data-[disabled]:text-foreground/30 
      group-data-[disabled]:line-through 

      group-data-[outside]:text-foreground/30 
      group-data-[outside]:group-data-[selected]:text-neutral-400 

      group-[.range-start:not(.range-end)]:rounded-e-none 
      group-[.range-end:not(.range-start)]:rounded-s-none 
      group-[.range-middle]:rounded-none 
`,

    day: 'group size-9 px-0 text-sm',
    range_start: 'range-start',
    range_end: 'range-end',
    range_middle: 'range-middle',
    today:
      '*:after:pointer-events-none *:after:absolute *:after:bottom-0.5 *:after:start-1/2 *:after:z-10 *:after:size-[3px] *:after:-translate-x-1/2 *:after:rounded-full *:after:bg-foreground [&[data-selected]:not(.range-middle)>*]:after:bg-transparent [&[data-disabled]>*]:after:bg-foreground/70 *:after:transition-colors',
    outside: 'text-muted-foreground data-selected:bg-accent/50 data-selected:text-muted-foreground',
    hidden: 'invisible',
    week_number: 'size-9 p-0 text-xs font-medium text-muted-foreground/80',
  }

  const mergedClassNames: typeof defaultClassNames = Object.keys(defaultClassNames).reduce(
    (acc, key) => ({
      ...acc,
      [key]: classNames?.[key as keyof typeof classNames]
        ? cn(
            defaultClassNames[key as keyof typeof defaultClassNames],
            classNames[key as keyof typeof classNames]
          )
        : defaultClassNames[key as keyof typeof defaultClassNames],
    }),
    {} as typeof defaultClassNames
  )

  const defaultComponents = {
    Chevron: (props: any) => {
      if (props.orientation === 'left') {
        return <ChevronLeft size={16} strokeWidth={2} {...props} aria-hidden="true" />
      }
      return <ChevronRight size={16} strokeWidth={2} {...props} aria-hidden="true" />
    },
  }

  const mergedComponents = {
    ...defaultComponents,
    ...userComponents,
  }

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      startMonth={startMonth}
      endMonth={endMonth}
      className={cn('w-fit', className)}
      classNames={mergedClassNames}
      components={mergedComponents}
      {...props}
    />
  )
}
Calendar.displayName = 'Calendar'

export { Calendar }
