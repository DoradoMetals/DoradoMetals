import * as React from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '../cn'

const partVariants = cva('text-small', {
  variants: {
    tone: {
      default: 'text-foreground',
      muted: 'text-muted-foreground',
    },
  },
  defaultVariants: { tone: 'default' },
})

export type ItemDetailsPart =
  'name' | 'displayName' | 'weight' | 'purity' | 'premium' | 'spot' | 'qty' | 'destination'

export type ItemDetailsProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & {
  name?: React.ReactNode
  displayName?: React.ReactNode
  weight?: React.ReactNode
  purity?: React.ReactNode
  premium?: React.ReactNode
  spot?: React.ReactNode
  qty?: React.ReactNode
  destination?: React.ReactNode
  tone?: 'default' | 'muted'
  leading?: ItemDetailsPart
}

export function ItemDetails({
  name,
  displayName,
  weight,
  purity,
  premium,
  spot,
  qty,
  destination,
  tone = 'default',
  leading,
  className,
  ...props
}: ItemDetailsProps) {
  const parts: [ItemDetailsPart, React.ReactNode][] = [
    ['name', name],
    ['displayName', displayName],
    ['weight', weight],
    ['qty', qty],
    ['purity', purity],
    ['premium', premium],
    ['spot', spot],
    ['destination', destination],
  ]
  const shown = parts.filter(([, value]) => value != null && value !== false && value !== '')
  const first = shown[0]?.[0]
  return (
    <div className={cn('flex flex-wrap items-center gap-2xs-plus', className)} {...props}>
      {shown.map(([key, value]) => (
        <React.Fragment key={key}>
          {key !== first && key !== leading && (
            <span aria-hidden className="text-small text-placeholder">
              {'·'}
            </span>
          )}
          <span
            data-part={key}
            data-leading={key === leading ? '' : undefined}
            className={cn(partVariants({ tone }), key === leading && 'font-medium')}
          >
            {value}
          </span>
        </React.Fragment>
      ))}
    </div>
  )
}
