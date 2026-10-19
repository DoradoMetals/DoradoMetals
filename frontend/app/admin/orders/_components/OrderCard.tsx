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
  /** The card can be selected (defaults to having an onSelectedChange). */
  selectable?: boolean
  /** At least one card on the list is selected: a click toggles instead of opening. */
  selectionActive?: boolean
  /** Toggle this card; used for click-anywhere once active, and for long-press. */
  onToggle?: () => void
  layout?: 'desktop' | 'mobile'
}

const LONG_PRESS_MS = 500

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
  selectable,
  selectionActive = false,
  onToggle,
  layout = 'desktop',
  className,
  onClick,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  ...props
}: OrderCardProps) {
  const canSelect = (selectable ?? onSelectedChange != null) && onToggle != null
  const press = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = React.useRef(false)
  const stopPress = () => {
    if (press.current != null) clearTimeout(press.current)
    press.current = null
  }
  const mobile = layout === 'mobile'
  const more = moreCount != null && moreCount > 0 ? (moreLabel ?? `+${moreCount} more`) : null
  return (
    <article
      data-layout={layout}
      data-selected={selected ? '' : undefined}
      className={cn(
        'flex flex-col justify-between rounded-lg border bg-card',
        // 673:20388 is 372 tall at 332 wide; the grid at the call site still stretches rows
        !mobile && 'min-h-[372px]',
        selected ? 'border-(length:--stroke-emphasis) border-primary' : 'border-border',
        className
      )}
      onClick={(event) => {
        onClick?.(event)
        if (!canSelect || event.defaultPrevented) return
        const target = event.target as HTMLElement
        if (longPressed.current) {
          longPressed.current = false
          event.preventDefault()
          return
        }
        // a keyboard activation (detail 0) on the link still opens the order
        const keyboard = event.detail === 0
        if (!selectionActive || keyboard || target.closest('[role="checkbox"],button')) return
        event.preventDefault()
        onToggle()
      }}
      onPointerDown={(event) => {
        onPointerDown?.(event)
        if (!canSelect || !mobile || selectionActive || event.pointerType === 'mouse') return
        longPressed.current = false
        press.current = setTimeout(() => {
          longPressed.current = true
          onToggle()
        }, LONG_PRESS_MS)
      }}
      onPointerUp={(event) => {
        onPointerUp?.(event)
        stopPress()
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event)
        stopPress()
      }}
      onPointerCancel={(event) => {
        onPointerCancel?.(event)
        stopPress()
      }}
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
        {lots.length > 0 && (
          <ul className="flex flex-col gap-xs px-sm pt-sm">
            {lots.map((lot) => (
              <LotRow key={lot.id} lot={lot} />
            ))}
          </ul>
        )}
        {(more != null || (!mobile && lots.length > 0)) && (
          <p
            data-part="more"
            className={cn(
              'flex items-center text-small font-medium text-muted-foreground',
              mobile ? 'h-9 px-sm-plus' : 'h-7 justify-center pt-xs'
            )}
          >
            {more}
          </p>
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
