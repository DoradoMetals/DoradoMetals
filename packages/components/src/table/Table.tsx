import * as React from 'react'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronsUpDown, Funnel } from '@dorado/icons'
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

// Column heads sit on the card surface (1101:429, 2026-10-19), 40 tall.
export function TableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('[&>tr]:h-(--control-md) [&>tr]:bg-card', className)} {...props} />
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={cn('[&>tr]:h-(--control-xl) [&>tr:hover]:bg-highest', className)}
      {...props}
    />
  )
}

const rowVariants = cva('transition-colors data-[state=selected]:bg-surface-raised', {
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

const insetRule = [
  '[&>*]:bg-[linear-gradient(var(--color-border),var(--color-border))] [&>*]:bg-no-repeat',
  '[&>*]:bg-size-[100%_1px] [&>*]:bg-position-[center_bottom]',
  '[&>*:first-child]:bg-size-[calc(100%-var(--spacing-sm))_1px] [&>*:first-child]:bg-position-[right_bottom]',
  '[&>*:last-child]:bg-size-[calc(100%-var(--spacing-sm))_1px] [&>*:last-child]:bg-position-[left_bottom]',
  '[&>*:first-child:last-child]:bg-size-[calc(100%-2*var(--spacing-sm))_1px] [&>*:first-child:last-child]:bg-position-[center_bottom]',
].join(' ')

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
      data-rule={borderless ? undefined : 'inset'}
      aria-selected={selected || undefined}
      aria-disabled={disabled || undefined}
      className={cn(
        !borderless && insetRule,
        rowVariants({ intent }),
        interactive && 'cursor-pointer focus-ring',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
      {...props}
    />
  )
}

export type SortDirection = 'asc' | 'desc' | null

export type TableHeadResize = {
  label: string
  onStart: (event: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>) => void
  active?: boolean
}

export function TableHead({
  className,
  numeric,
  fill,
  sorted,
  onSort,
  filter,
  filtered,
  onFilter,
  resize,
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
  resize?: TableHeadResize
}) {
  const sortable = onSort != null
  // Table Sort 1171:109: at rest muted chevrons, the active sort in primary.
  const SortIcon =
    sorted === 'asc' ? ArrowUpNarrowWide : sorted === 'desc' ? ArrowDownWideNarrow : ChevronsUpDown
  const sortTone = sorted === 'asc' || sorted === 'desc' ? 'text-primary' : 'text-muted-foreground'

  return (
    <th
      scope={props.scope ?? 'col'}
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
        resize && 'group/head relative',
        className
      )}
      {...props}
    >
      <span className="inline-flex items-center gap-2xs">
        {sortable ? (
          <button
            type="button"
            onClick={onSort}
            className="inline-flex cursor-pointer items-center gap-2xs rounded-sm hover:text-foreground focus-ring"
          >
            {children}
            <SortIcon aria-hidden className={cn('size-sm', sortTone)} />
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
            className="inline-flex cursor-pointer items-center rounded-sm text-muted-foreground hover:text-foreground aria-pressed:text-foreground focus-ring"
          >
            <Funnel aria-hidden className="size-sm" />
          </button>
        )}
        {filter}
      </span>
      {resize && (
        <span
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${resize.label}`}
          data-state={resize.active ? 'active' : undefined}
          onMouseDown={resize.onStart}
          onTouchStart={resize.onStart}
          className={cn(
            'absolute top-1/2 right-0 h-md w-0.5 -translate-y-1/2 cursor-col-resize touch-none bg-border-strong transition-opacity select-none',
            resize.active ? 'opacity-100' : 'opacity-0 group-hover/head:opacity-100'
          )}
        />
      )}
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
