'use client'

import * as React from 'react'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../cn'

export type RadioGroupProps = React.ComponentProps<typeof RadioGroupPrimitive.Root>

export function RadioGroup({ className, ...props }: RadioGroupProps) {
  return <RadioGroupPrimitive.Root className={cn(className)} {...props} />
}

export type RadioProps = React.ComponentProps<typeof RadioGroupPrimitive.Item>

export function Radio({ className, ...props }: RadioProps) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(
        'group peer flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-card outline-none transition-colors',
        'data-[state=unchecked]:hover:border-border-strong data-[state=unchecked]:hover:bg-accent',
        'data-[state=checked]:border-primary data-[state=checked]:hover:bg-accent',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
        'aria-invalid:border-destructive',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'disabled:data-[state=checked]:border-border-strong disabled:data-[state=checked]:bg-border-strong',
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="size-2 rounded-full bg-primary group-disabled:bg-background" />
    </RadioGroupPrimitive.Item>
  )
}

export const radioOptionVariants = cva(
  cn(
    'group relative flex cursor-pointer select-none rounded-lg border border-border bg-card text-left outline-none transition-colors',
    'hover:border-border-strong hover:bg-accent',
    'data-[state=checked]:border-[1.5px] data-[state=checked]:border-primary data-[state=checked]:hover:bg-accent',
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
    'disabled:cursor-not-allowed disabled:opacity-50'
  ),
  {
    variants: {
      variant: {
        tile: 'flex-col items-center justify-center gap-2xs p-sm text-center',
        card: 'items-start justify-between gap-sm p-md',
        chip: 'h-10 items-center justify-center px-sm text-small font-medium text-muted-foreground data-[state=checked]:text-foreground',
        segment:
          'items-center justify-center gap-2xs rounded-md border-transparent bg-muted px-sm py-xs text-small font-medium text-muted-foreground data-[state=checked]:border data-[state=checked]:border-border data-[state=checked]:bg-card data-[state=checked]:text-foreground',
      },
    },
    defaultVariants: { variant: 'card' },
  }
)

export type RadioOptionVariant = NonNullable<VariantProps<typeof radioOptionVariants>['variant']>

export type RadioOptionProps = Omit<
  React.ComponentProps<typeof RadioGroupPrimitive.Item>,
  'className'
> &
  VariantProps<typeof radioOptionVariants> & {
    className?: string
    showRadio?: boolean
  }

const indicatorPosition: Record<RadioOptionVariant, string> = {
  tile: 'absolute right-2xs top-2xs',
  card: 'shrink-0 self-start',
  chip: 'absolute right-xs top-1/2 -translate-y-1/2',
  segment: 'absolute right-xs top-1/2 -translate-y-1/2',
}

export function RadioOption({
  className,
  variant,
  showRadio,
  children,
  ...props
}: RadioOptionProps) {
  const resolvedVariant = variant ?? 'card'
  const resolvedShowRadio = showRadio ?? resolvedVariant === 'card'
  return (
    <RadioGroupPrimitive.Item
      className={cn(radioOptionVariants({ variant: resolvedVariant }), className)}
      {...props}
    >
      {children}
      {resolvedShowRadio && (
        <span
          aria-hidden
          className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded-full border border-border bg-card transition-colors',
            'group-hover:border-border-strong group-hover:bg-accent',
            'group-data-[state=checked]:border-primary group-data-[state=checked]:group-hover:bg-accent',
            'group-disabled:group-data-[state=checked]:border-border-strong group-disabled:group-data-[state=checked]:bg-border-strong',
            indicatorPosition[resolvedVariant]
          )}
        >
          <RadioGroupPrimitive.Indicator className="size-2 rounded-full bg-primary group-disabled:bg-background" />
        </span>
      )}
    </RadioGroupPrimitive.Item>
  )
}
