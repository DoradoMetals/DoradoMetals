'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { Rating, RatingButton } from '@/shared/ui/base/rating'
import { cn } from '@/shared/utils/cn'
import { ReactNode } from 'react'

export type Align = 'left' | 'center' | 'right'

function headerAlignClass(align: Align) {
  if (align === 'center') return 'flex justify-center text-sm text-neutral-600'
  if (align === 'right') return 'flex justify-end text-sm text-neutral-600'
  return 'flex justify-start text-sm text-neutral-600'
}

function cellAlignClass(align: Align) {
  if (align === 'center') return 'flex justify-center'
  if (align === 'right') return 'flex justify-end'
  return 'flex justify-start'
}

/* -------------------------------------------------------------------------- */
/* Base + shared helpers                                                      */
/* -------------------------------------------------------------------------- */

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

  size?: number
  minSize?: number
  maxSize?: number
}

type CellRenderArgs<TData> = {
  value: unknown
  row: TData
}

type CreateColumnOptions<TData> = BaseColumnOptions<TData> & {
  headerContent: ReactNode
  renderCellContent: (args: CellRenderArgs<TData>) => ReactNode
  filterFnOverride?: ColumnDef<TData>['filterFn']
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
  hideOnSmall,
  size,
  minSize,
  maxSize,
  headerContent,
  renderCellContent,
  filterFnOverride,
}: CreateColumnOptions<TData>): ColumnDef<TData> {
  return {
    id,
    accessorKey,
    enableHiding,
    enableColumnFilter,
    filterFn: filterFnOverride ?? (enableColumnFilter ? 'includesString' : undefined),
    header: () => (
      <span
        className={cn(headerAlignClass(align), hideOnSmall && 'hidden sm:flex', headerClassName)}
      >
        {headerContent}
      </span>
    ),
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
  textClassName = 'text-xs sm:text-sm text-neutral-900 block truncate whitespace-nowrap',
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
        return <span className="text-xs sm:text-sm text-neutral-900">-</span>
      }

      const date = raw instanceof Date ? raw : new Date(raw)
      const formatted =
        format?.(date) ??
        date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })

      return <span className="text-xs sm:text-sm text-neutral-900">{formatted}</span>
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
            <RatingButton key={i} size={16} className="transition-transform text-primary" />
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

type ChipColumnOptions<TData> = BaseColumnOptions<TData> & {
  header: string
  getChip: (args: { value: unknown; row: TData }) => {
    label: ReactNode
    className?: string
  }
}

export function ChipColumn<TData>({
  header,
  getChip,
  ...base
}: ChipColumnOptions<TData>): ColumnDef<TData> {
  return createColumn<TData>({
    ...base,
    headerContent: header,
    renderCellContent: ({ value, row }) => {
      const chip = getChip({ value, row })

      return (
        <span
          className={cn(
            'px-2 py-0.5 border rounded-lg text-xs font-semibold inline-flex items-center justify-center',
            chip.className
          )}
        >
          {chip.label}
        </span>
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

  return <span className="text-xs sm:text-sm text-neutral-900">{formatted}</span>
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
  placeholderClassName = 'bg-neutral-50 border-neutral-200',
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
