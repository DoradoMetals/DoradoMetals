'use client'

import type { ColumnDef, HeaderContext } from '@tanstack/react-table'
import { Rating, RatingButton } from '@/shared/ui/base/rating'
import { cn } from '@/shared/utils/cn'
import { ReactNode } from 'react'
import { Checkbox } from '@dorado/components'
import { PopoverSelect } from '@/shared/ui/table/PopoverSelect'
import StatusChip, { type ChipTone } from '@/shared/ui/StatusChip'

export type Align = 'left' | 'center' | 'right'

/* ALIGNMENT ONLY. The size and colour used to be spelled here too
   (`text-sm text-muted-foreground`), which is exactly what `TableHead`'s own default
   already is - so every column header was re-asserting the default at a
   smaller, non-responsive size. `text-left/center/right` stays: alignment is
   LAYOUT, and there are 205 of them in the tree. */
function headerAlignClass(align: Align) {
  if (align === 'center') return 'flex justify-center'
  if (align === 'right') return 'flex justify-end'
  return 'flex justify-start'
}

function cellAlignClass(align: Align) {
  if (align === 'center') return 'flex justify-center'
  if (align === 'right') return 'flex justify-end'
  return 'flex justify-start'
}

/* -------------------------------------------------------------------------- */
/* Base + shared helpers                                                      */
/* -------------------------------------------------------------------------- */
type HeaderFilterConfig = {
  options: string[]
  placeholder?: string
  label?: string
  widthClass?: string
  triggerClass?: string
  popoverClass?: string
  includeSearch?: boolean
  mapLabelToFilterValue?: (label: string) => unknown
  mapFilterValueToLabel?: (value: unknown) => string
}

type BaseColumnOptions<TData> = {
  id: string
  accessorKey: string
  header?: string
  align?: Align
  enableHiding?: boolean
  enableColumnFilter?: boolean
  className?: string
  headerClassName?: string
  cellClassName?: string
  hideOnSmall?: boolean
  enableGrouping?: boolean
  headerFilter?: HeaderFilterConfig
  size?: number
  minSize?: number
  maxSize?: number
  filterFnOverride?: ColumnDef<TData>['filterFn']
}

type CellRenderArgs<TData> = {
  value: unknown
  row: TData
}

type CreateColumnOptions<TData> = BaseColumnOptions<TData> & {
  headerContent: ReactNode
  headerRight?: (ctx: HeaderContext<TData, unknown>) => ReactNode
  renderCellContent: (args: CellRenderArgs<TData>) => ReactNode
}

function createColumn<TData>({
  id,
  accessorKey,
  align = 'left',
  enableHiding = true,
  enableColumnFilter = true,
  className,
  headerClassName,
  cellClassName,
  enableGrouping = false,
  hideOnSmall,
  size,
  minSize,
  maxSize,
  headerContent,
  renderCellContent,
  filterFnOverride,
  headerRight,
  headerFilter,
}: CreateColumnOptions<TData>): ColumnDef<TData> {
  return {
    id,
    accessorKey,
    enableHiding,
    enableGrouping,
    enableColumnFilter,
    filterFn: filterFnOverride ?? (enableColumnFilter ? 'includesString' : undefined),

    header: (ctx) => {
      const right =
        headerRight ??
        (headerFilter
          ? ({ column }: HeaderContext<TData, unknown>) => {
              const raw = column.getFilterValue()

              const valueLabel =
                raw == null
                  ? 'All'
                  : (headerFilter.mapFilterValueToLabel?.(raw) ??
                    headerFilter.options.find((opt) => {
                      const mapped = headerFilter.mapLabelToFilterValue?.(opt) ?? opt
                      return mapped === raw
                    }) ??
                    String(raw))

              return (
                <div className={cn(headerFilter.widthClass ?? 'w-[120px]')}>
                  <PopoverSelect
                    label={headerFilter.label}
                    value={valueLabel}
                    options={headerFilter.options}
                    placeholder={headerFilter.placeholder ?? 'All'}
                    triggerClass={cn('h-8 px-2', headerFilter.triggerClass)}
                    popoverClass={headerFilter.popoverClass}
                    includeSearch={headerFilter.includeSearch ?? true}
                    onChange={(label) => {
                      if (label === 'All') {
                        column.setFilterValue(undefined)
                        return
                      }
                      const v = headerFilter.mapLabelToFilterValue?.(label) ?? label
                      column.setFilterValue(v)
                    }}
                  />
                </div>
              )
            }
          : undefined)

      return (
        <span
          className={cn(headerAlignClass(align), hideOnSmall && 'hidden sm:flex', headerClassName)}
        >
          <span className="inline-flex items-center gap-2">
            {headerContent}
            {right?.(ctx)}
          </span>
        </span>
      )
    },

    cell: (ctx) => {
      const value = ctx.getValue()
      const row = ctx.row.original as TData

      return (
        <div
          className={cn(
            cellAlignClass(align),
            hideOnSmall && 'hidden sm:flex',
            className,
            cellClassName
          )}
        >
          {renderCellContent({ value, row })}
        </div>
      )
    },

    size,
    minSize,
    maxSize,
  }
}

/* -------------------------------------------------------------------------- */
/* TEXT COLUMN                                                                */
/* -------------------------------------------------------------------------- */

type TextColumnOptions<TData> = BaseColumnOptions<TData> & {
  header: string
  textClassName?: string
  formatValue?: (value: unknown, row: TData) => ReactNode
}

export function TextColumn<TData>({
  header,
  /* Size comes from `TableCell` (`text-micro md:text-small`); only the
     BRIGHTNESS is this column's own decision - a value reads one step above the
     cell default. Was `text-xs sm:text-sm`, a second, disagreeing responsive
     step layered on top of the cell's. */
  textClassName = 'text-foreground block truncate whitespace-nowrap',
  formatValue,
  ...base
}: TextColumnOptions<TData>): ColumnDef<TData> {
  return createColumn<TData>({
    ...base,
    headerContent: header,
    renderCellContent: ({ value, row }) => {
      const v = formatValue ? formatValue(value, row) : (value as ReactNode)
      return <span className={textClassName}>{v}</span>
    },
  })
}

/* -------------------------------------------------------------------------- */
/* DATE COLUMN                                                                */
/* -------------------------------------------------------------------------- */

type DateColumnOptions<TData> = BaseColumnOptions<TData> & {
  header: string
  format?: (date: Date) => string
}

export function DateColumn<TData>({
  header,
  format,
  hideOnSmall = true,
  ...base
}: DateColumnOptions<TData>): ColumnDef<TData> {
  return createColumn<TData>({
    ...base,
    hideOnSmall,
    headerContent: header,
    renderCellContent: ({ value }) => {
      const raw = value as string | number | Date | null
      if (!raw) {
        return <span className="text-foreground">-</span>
      }

      const date = raw instanceof Date ? raw : new Date(raw)
      const formatted =
        format?.(date) ??
        date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })

      return <span className="text-foreground">{formatted}</span>
    },
  })
}

/* -------------------------------------------------------------------------- */
/* RATING COLUMN                                                              */
/* -------------------------------------------------------------------------- */

type RatingColumnOptions<TData> = BaseColumnOptions<TData> & {
  header?: string
}

export function RatingColumn<TData>({
  header = 'Rating',
  ...base
}: RatingColumnOptions<TData>): ColumnDef<TData> {
  return createColumn<TData>({
    ...base,
    headerContent: header,
    renderCellContent: ({ value }) => {
      const rating = Number(value) || 0
      return (
        <Rating value={rating} readOnly>
          {Array.from({ length: 5 }).map((_, i) => (
            <RatingButton key={i} size={16} />
          ))}
        </Rating>
      )
    },
  })
}

/* -------------------------------------------------------------------------- */
/* ICON COLUMN                                                                */
/* -------------------------------------------------------------------------- */

type IconColumnOptions<TData> = BaseColumnOptions<TData> & {
  header: string
  renderIcon: (args: { value: unknown; row: TData }) => ReactNode
}

export function IconColumn<TData>({
  header,
  renderIcon,
  ...base
}: IconColumnOptions<TData>): ColumnDef<TData> {
  return createColumn<TData>({
    ...base,
    headerContent: header,
    renderCellContent: ({ value, row }) => renderIcon({ value, row }),
  })
}

/* -------------------------------------------------------------------------- */
/* CHIP COLUMN                                                                */
/* -------------------------------------------------------------------------- */

/* A CHIP IN A TABLE CELL IS THE SAME CHIP AS ANYWHERE ELSE.

   This used to hand-roll its own pill and let `getChip` return a raw
   `className`, so all four call sites wrote strings like
   `'bg-success/20 text-success border-success'` - the exact appearance-at-the-
   call-site pattern ruling 20 forbids, spelled in a table column definition
   where no lint was looking. It was also a SECOND chip implementation
   (`rounded-lg`, `text-xs`, `font-semibold`) sitting beside `StatusChip`, so
   the same status looked different in a table and in a drawer.

   `getChip` now returns a `tone` from the shared vocabulary - the same six
   values `Button` takes as `intent` - and renders a real `StatusChip`. Chips
   in tables are pills now, like every other chip (ruling 19).

   `className` survives on the returned chip for LAYOUT ONLY. */
type ChipColumnOptions<TData> = BaseColumnOptions<TData> & {
  header: string
  getChip: (args: { value: unknown; row: TData }) => {
    label: ReactNode
    /** neutral | brand | success | danger | warning | info. */
    tone?: ChipTone
    /** LAYOUT ONLY (w-full, ml-auto). Never appearance. */
    className?: string
  }
}

export function ChipColumn<TData>({ header, getChip, ...base }: ChipColumnOptions<TData>) {
  return createColumn<TData>({
    ...base,
    headerContent: header,
    renderCellContent: ({ value, row }) => {
      const chip = getChip({ value, row })
      return (
        <StatusChip tone={chip.tone ?? 'neutral'} className={chip.className}>
          {chip.label}
        </StatusChip>
      )
    },
  })
}

/* -------------------------------------------------------------------------- */
/* ORDER NUMBER COLUMN                                                        */
/* -------------------------------------------------------------------------- */

type OrderNumberFormatterHook = () => {
  formatPurchaseOrderNumber?: (orderNumber: number | null | undefined) => string
  formatSalesOrderNumber?: (orderNumber: number | null | undefined) => string
}

type OrderNumberColumnOptions<TData> = BaseColumnOptions<TData> & {
  header?: string
  align?: Align
  useFormatterHook: OrderNumberFormatterHook
}

function OrderNumberCellComponent({
  useFormatterHook,
  value,
}: {
  useFormatterHook: OrderNumberFormatterHook
  value: unknown
}) {
  const { formatPurchaseOrderNumber, formatSalesOrderNumber } = useFormatterHook()

  const format =
    formatPurchaseOrderNumber ??
    formatSalesOrderNumber ??
    ((v: number | null | undefined) => (v == null ? '' : String(v)))

  const raw = value as number | null | undefined
  const formatted = format(raw)

  return <span className="text-foreground">{formatted}</span>
}

export function OrderNumberColumn<TData>({
  header = 'Order #',
  useFormatterHook,
  enableColumnFilter = true,
  ...base
}: OrderNumberColumnOptions<TData>): ColumnDef<TData> {
  return createColumn<TData>({
    ...base,
    enableColumnFilter,
    headerContent: header,
    renderCellContent: ({ value }) => (
      <OrderNumberCellComponent useFormatterHook={useFormatterHook} value={value} />
    ),
    filterFnOverride: enableColumnFilter ? 'includesString' : undefined,
  })
}

/* -------------------------------------------------------------------------- */
/* IMAGE COLUMN                                                               */
/* -------------------------------------------------------------------------- */

type ImageColumnOptions<TData> = BaseColumnOptions<TData> & {
  header?: string
  getSrc?: (args: { value: unknown; row: TData }) => string | null | undefined
  getAlt?: (args: { value: unknown; row: TData }) => string
  height?: number
  width?: number
  rounded?: 'none' | 'sm' | 'md' | 'full'
  placeholder?: ReactNode
  placeholderClassName?: string
  fallbackSrc?: string
  objectFit?: 'contain' | 'cover'
}

function roundedClass(r: NonNullable<ImageColumnOptions<any>['rounded']>) {
  if (r === 'full') return 'rounded-full'
  if (r === 'md') return 'rounded-md'
  if (r === 'sm') return 'rounded-sm'
  return ''
}

export function ImageColumn<TData>({
  header = '',
  getSrc,
  getAlt,
  height = 28,
  width = 28,
  rounded = 'md',
  placeholder,
  placeholderClassName = 'bg-muted border-border',
  fallbackSrc,
  objectFit = 'contain',
  align = 'left',
  enableColumnFilter = false,
  ...base
}: ImageColumnOptions<TData>): ColumnDef<TData> {
  return createColumn<TData>({
    ...base,
    align,
    enableColumnFilter,
    headerContent: header,
    renderCellContent: ({ value, row }) => {
      const srcRaw = getSrc ? getSrc({ value, row }) : (value as string | null | undefined)
      const src = (srcRaw ?? '').trim()
      const alt = getAlt ? getAlt({ value, row }) : ''

      if (!src) {
        return (
          placeholder ?? (
            <div
              className={cn('shrink-0', roundedClass(rounded), placeholderClassName)}
              style={{ width: width, height: height }}
            />
          )
        )
      }

      return (
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          onError={(e) => {
            if (!fallbackSrc) return
            const img = e.currentTarget
            if (img.src === fallbackSrc) return
            img.src = fallbackSrc
          }}
          className={cn(
            'shrink-0',
            roundedClass(rounded),
            objectFit === 'contain' ? 'object-contain' : 'object-cover'
          )}
          style={{ width: width, height: height }}
        />
      )
    },
  })
}

export function SelectionColumn<TData>(): ColumnDef<TData, unknown> {
  return {
    id: '__select',
    size: 36,
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        aria-label="Select all rows on page"
        className="cursor-pointer bg-transparent border border-border"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        disabled={!row.getCanSelect()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        aria-label="Select row"
        className="cursor-pointer bg-transparent border border-border"
      />
    ),
  }
}
