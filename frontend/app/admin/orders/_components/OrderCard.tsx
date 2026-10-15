'use client'

import * as React from 'react'
import { ImageIcon } from '@dorado/icons'
import type { OrderState as OrderStateValue } from '@dorado/contracts'
import { OrderState } from './OrderState'
import { Checkbox, cn, ItemDetails, Link } from '@dorado/components'

export type OrderCardLot = {
  id: string
  name: string
  reference: string
  imageSrc?: string
  weight?: React.ReactNode
  qty?: React.ReactNode
  purity?: React.ReactNode
  position?: React.ReactNode
}

export type OrderCardProps = Omit<React.HTMLAttributes<HTMLElement>, 'children' | 'onSelect'> & {
  reference: React.ReactNode
  customer: React.ReactNode
  state: OrderStateValue
  lots: OrderCardLot[]
  moreCount?: number
  moreLabel?: React.ReactNode
  summary: React.ReactNode
  date: React.ReactNode
  href?: string
  selected?: boolean
  onSelectedChange?: (selected: boolean) => void
  selectLabel?: string
  layout?: 'desktop' | 'mobile'
}

function LotRow({ lot }: { lot: OrderCardLot }) {
  const placed = lot.position != null
  return (
    <li
      data-placed={placed ? '' : undefined}
      className={cn(
        'flex items-center gap-sm rounded-md bg-muted px-xs py-2xs',
        placed && 'opacity-60'
      )}
    >
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-secondary"
      >
        {lot.imageSrc != null ? (
          <img src={lot.imageSrc} alt="" className="size-full object-cover" />
        ) : (
          <ImageIcon className="size-md text-muted-foreground" />
        )}
      </span>
      <p
        className={cn(
          'min-w-0 flex-1 truncate text-small font-medium',
          placed ? 'text-muted-foreground' : 'text-foreground'
        )}
      >
        {lot.name}
      </p>
      <p className="font-mono text-micro font-medium text-muted-foreground">{lot.reference}</p>
      {placed ? (
        <p className="text-small text-muted-foreground">{lot.position}</p>
      ) : (
        <ItemDetails
          tone="muted"
          weight={lot.weight}
          qty={lot.qty}
          purity={lot.purity}
          leading={lot.weight != null ? 'weight' : lot.qty != null ? 'qty' : undefined}
          className="flex-nowrap"
        />
      )}
    </li>
  )
}

export function OrderCard({
  reference,
  customer,
  state,
  lots,
  moreCount,
  moreLabel,
  summary,
  date,
  href,
  selected = false,
  onSelectedChange,
  selectLabel = 'Select order',
  layout = 'desktop',
  className,
  ...props
}: OrderCardProps) {
  const mobile = layout === 'mobile'
  const more = moreCount != null && moreCount > 0 ? (moreLabel ?? `+${moreCount} more`) : null
  return (
    <article
      data-layout={layout}
      data-selected={selected ? '' : undefined}
      className={cn(
        'flex flex-col justify-between rounded-lg border bg-card',
        selected ? 'border-(length:--stroke-emphasis) border-primary' : 'border-border',
        className
      )}
      {...props}
    >
      <div className="flex flex-col">
        <header className="flex items-start justify-between gap-sm p-sm">
          <div className="flex min-w-0 flex-col">
            {href != null ? (
              <Link href={href} intent="neutral">
                {reference}
              </Link>
            ) : (
              <p className="text-small font-medium text-foreground">{reference}</p>
            )}
            <p className="truncate text-micro text-muted-foreground">{customer}</p>
          </div>
          {onSelectedChange != null && (
            <Checkbox
              aria-label={selectLabel}
              checked={selected}
              onCheckedChange={(next) => onSelectedChange(next === true)}
            />
          )}
        </header>
        <div className="flex items-center gap-xs px-sm pb-sm">
          <OrderState state={state} />
        </div>
        {(lots.length > 0 || more != null) && (
          <div className="flex flex-col gap-xs px-sm pt-sm">
            <ul className="flex flex-col gap-xs">
              {lots.map((lot) => (
                <LotRow key={lot.id} lot={lot} />
              ))}
            </ul>
            {more != null && (
              <p
                className={cn(
                  'flex items-center text-small font-medium text-muted-foreground',
                  mobile ? 'h-9 px-sm-plus' : 'justify-center pt-xs'
                )}
              >
                {more}
              </p>
            )}
          </div>
        )}
      </div>
      <footer className="flex items-center justify-between gap-sm p-sm">
        <p className="shrink-0 whitespace-nowrap text-micro font-medium text-foreground">
          {summary}
        </p>
        <p className="min-w-0 truncate text-micro text-muted-foreground">{date}</p>
      </footer>
    </article>
  )
}
