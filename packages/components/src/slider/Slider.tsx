'use client'

import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '../cn'

export type SliderProps = React.ComponentProps<typeof SliderPrimitive.Root> & {
  showValue?: boolean
}

export function Slider({
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  showValue = true,
  value,
  defaultValue,
  min = 0,
  max = 100,
  ...props
}: SliderProps) {
  const current = (value ?? defaultValue ?? [min])[0] ?? min
  const percent = Math.round(((current - min) / (max - min)) * 100)

  return (
    <span
      className={cn('flex w-full items-center gap-xs', props.disabled && 'opacity-50', className)}
    >
      <SliderPrimitive.Root
        value={value}
        defaultValue={defaultValue}
        min={min}
        max={max}
        className="relative flex w-full grow touch-none select-none items-center data-[disabled]:pointer-events-none"
        {...props}
      >
        <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-muted">
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-primary data-[disabled]:bg-border-strong" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledby}
          className={cn(
            'block size-4 cursor-grab rounded-full bg-primary data-[disabled]:bg-border-strong',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background'
          )}
        />
      </SliderPrimitive.Root>
      {showValue && (
        <span
          className={cn(
            'shrink-0 text-small font-medium text-foreground',
            props.disabled && 'text-muted-foreground'
          )}
        >
          {percent}%
        </span>
      )}
    </span>
  )
}
