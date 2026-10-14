import * as React from 'react'
import { ArrowDownWideNarrow, ArrowUpDown, ArrowUpNarrowWide, Funnel } from '@dorado/icons'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../cn'

export function Table({
  className,
  bare = false,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement> & { bare?: boolean }) {
  return (
    <div
      className={cn(
        'w-full overflow-x-auto',
        !bare && 'rounded-lg border border-border bg-card',
        className
      )}
    >
      <table className="w-full" {...props} />
    </div>
  )
}

export function TableHeader({
  className,
  surface = 'muted',
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement> & { surface?: 'muted' | 'card' }) {
  return (
    <thead
      className={cn(
        '[&>tr]:h-(--control-md)',
        surface === 'card' ? '[&>tr]:bg-card' : '[&>tr]:bg-muted',
        className
      )}
      {...props}
    />
  )
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cn('[&>tr]:h-(--control-xl) [&>tr:hover]:bg-accent', className)} {...props} />
  )
}

const rowVariants = cva('transition-colors data-[state=selected]:bg-muted', {
  variants: {
    intent: {
      neutral: '',
      success: 'bg-success-muted',
      danger: 'bg-destructive-muted',
      warning: 'bg-warning-muted',
      info: 'bg-info-muted',
    },
  },
})

export type TableRowIntent = NonNullable<VariantProps<typeof rowVariants>['intent']>

export type TableRowProps = React.HTMLAttributes<HTMLTableRowElement> & {
  selected?: boolean
  borderless?: boolean
  interactive?: boolean
  disabled?: boolean
  intent?: TableRowIntent
}

export function TableRow({
  className,
  selected,
  borderless = false,
  interactive = false,
  disabled = false,
  intent = 'neutral',
  ...props
}: TableRowProps) {
  return (
    <tr
      data-state={selected ? 'selected' : undefined}
      aria-selected={selected || undefined}
      aria-disabled={disabled || undefined}
      className={cn(
        borderless ? 'border-b-0' : 'border-b border-border',
        rowVariants({ intent }),
        interactive && 'cursor-pointer',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
      {...props}
    />
  )
}

export type SortDirection = 'asc' | 'desc' | null

export function TableHead({
  className,
  numeric,
  fill,
  sorted,
  onSort,
  filter,
  filtered,
  onFilter,
  children,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & {
  numeric?: boolean
  fill?: boolean
  sorted?: SortDirection
  onSort?: () => void
  filter?: React.ReactNode
  filtered?: boolean
  onFilter?: () => void
}) {
  const sortable = onSort != null
  const SortIcon =
    sorted === 'asc' ? ArrowUpNarrowWide : sorted === 'desc' ? ArrowDownWideNarrow : ArrowUpDown

  return (
    <th
      scope="col"
      aria-sort={
        sortable
          ? sorted === 'asc'
            ? 'ascending'
            : sorted === 'desc'
              ? 'descending'
              : 'none'
          : undefined
      }
      className={cn(
        'px-2xs-plus align-middle text-micro font-medium text-muted-foreground first:pl-sm last:pr-sm',
        numeric ? 'text-right' : 'text-left',
        fill ? 'w-full' : 'whitespace-nowrap',
        className
      )}
      {...props}
    >
      <span className="inline-flex items-center gap-2xs">
        {sortable ? (
          <button
            type="button"
            onClick={onSort}
            className="inline-flex cursor-pointer items-center gap-2xs hover:text-foreground"
          >
            {children}
            <SortIcon aria-hidden className="size-sm" />
          </button>
        ) : (
          children
        )}
        {onFilter && (
          <button
            type="button"
            onClick={onFilter}
            aria-pressed={filtered ?? false}
            aria-label="Filter"
            className="inline-flex cursor-pointer items-center text-muted-foreground hover:text-foreground aria-pressed:text-foreground"
          >
            <Funnel aria-hidden className="size-sm" />
          </button>
        )}
        {filter}
      </span>
    </th>
  )
}

export function TableCell({
  className,
  numeric,
  primary,
  fill,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
  numeric?: boolean
  primary?: boolean
  fill?: boolean
}) {
  return (
    <td
      className={cn(
        'px-2xs-plus align-middle text-small first:pl-sm last:pr-sm',
        numeric ? 'text-right tabular-nums' : 'text-left',
        fill ? 'w-full max-w-0 truncate' : 'whitespace-nowrap',
        primary ? 'font-medium text-foreground' : 'text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}
