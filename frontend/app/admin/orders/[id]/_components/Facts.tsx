import * as React from 'react'
import { cn } from '@dorado/components'

export type Fact = { label: React.ReactNode; value: React.ReactNode; key?: string }

export type FactsProps = {
  facts: Fact[]
  layout?: 'desktop' | 'mobile'
  className?: string
}

export function Facts({ facts, layout = 'desktop', className }: FactsProps) {
  const mobile = layout === 'mobile'
  const shown = facts.filter((fact) => fact.value != null && fact.value !== false)
  return (
    <dl
      data-layout={layout}
      className={cn(
        mobile ? 'grid grid-cols-2 gap-x-md gap-y-sm' : 'flex justify-between gap-md',
        className
      )}
    >
      {shown.map((fact, index) => {
        const end = mobile ? index % 2 === 1 : index === shown.length - 1 && index > 0
        return (
          <div
            key={fact.key ?? (typeof fact.label === 'string' ? fact.label : index)}
            className={cn('flex min-w-0 flex-col gap-3xs', end && 'items-end text-right')}
          >
            <dt className="text-micro text-muted-foreground">{fact.label}</dt>
            <dd className="text-small font-medium text-foreground">{fact.value}</dd>
          </div>
        )
      })}
    </dl>
  )
}
