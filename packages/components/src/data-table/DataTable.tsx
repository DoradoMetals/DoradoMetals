'use client'

import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  type Cell,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type ExpandedState,
  type PaginationState,
  type Row,
  type RowData,
  type RowSelectionState,
  type SortingState,
  columnFilteringFeature,
  columnGroupingFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createExpandedRowModel,
  createFilteredRowModel,
  createGroupedRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { ChevronDown, ChevronRight } from '@dorado/icons'

import { Checkbox } from '../checkbox/Checkbox'
import { cn } from '../cn'
import { Alert } from '../alert/Alert'
import { Pagination } from '../pagination/Pagination'
import { Select } from '../select/Select'
import { Skeleton } from '../skeleton/Skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../table/Table'
import { TableActions } from './TableActions'

export type DataTableColumnMeta = {
  numeric?: boolean
  primary?: boolean
  fill?: boolean
  hidden?: boolean
}

function makeFeatures<M extends DataTableColumnMeta>() {
  return tableFeatures({
    rowSortingFeature,
    sortedRowModel: createSortedRowModel(),
    sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, datetime: sortFn_datetime },
    columnFilteringFeature,
    filteredRowModel: createFilteredRowModel(),
    filterFns: { includesString: filterFn_includesString },
    rowSelectionFeature,
    columnVisibilityFeature,
    rowPaginationFeature,
    paginatedRowModel: createPaginatedRowModel(),
    columnGroupingFeature,
    groupedRowModel: createGroupedRowModel(),
    rowExpandingFeature,
    expandedRowModel: createExpandedRowModel(),
    columnSizingFeature,
    columnResizingFeature,
    columnPinningFeature,
    columnMeta: {} as M,
  })
}

const features = makeFeatures<DataTableColumnMeta>()

export type DataTableFeatures<M extends DataTableColumnMeta = DataTableColumnMeta> = ReturnType<
  typeof makeFeatures<M>
>

export type DataTableColumn<
  T extends RowData,
  M extends DataTableColumnMeta = DataTableColumnMeta,
> = ColumnDef<DataTableFeatures<M>, T>

export const dataTableColumns = <
  T extends RowData,
  M extends DataTableColumnMeta = DataTableColumnMeta,
>() => createColumnHelper<DataTableFeatures<M>, T>()

export type DataTableCell<M extends DataTableColumnMeta = DataTableColumnMeta> = {
  id: string
  label: string | undefined
  meta: M | undefined
  content: React.ReactNode
}

const NO_IDS: string[] = []
const SELECT_COLUMN_ID = '__select'
const EXPAND_COLUMN_ID = '__expand'

export type DataTableActionsContext<T> = { selected: T[] }

export type DataTableProps<
  T extends RowData,
  M extends DataTableColumnMeta = DataTableColumnMeta,
> = {
  columns: DataTableColumn<T, M>[]
  data: T[]
  label: string
  getRowId?: (row: T, index: number) => string
  title?: React.ReactNode
  actions?: React.ReactNode | ((context: DataTableActionsContext<T>) => React.ReactNode)
  onDelete?: (rows: T[]) => void
  toolbar?: React.ReactNode
  bordered?: boolean
  layout?: 'desktop' | 'mobile'
  mobileRow?: (row: T, cells: DataTableCell<M>[]) => React.ReactNode
  empty?: React.ReactNode
  loading?: boolean
  error?: React.ReactNode
  className?: string
  selectable?: boolean
  onRowSelectionChange?: (rows: T[]) => void
  sorting?: SortingState
  onSortingChange?: (sorting: SortingState) => void
  total?: number
  onRowClick?: (row: T) => void
  pageSize?: number
  pageSizes?: number[]
  page?: number
  pageCount?: number
  onPageChange?: (page: number) => void
  scrolling?: 'paginated' | 'virtualized'
  renderExpanded?: (row: T) => React.ReactNode
  grouping?: string[]
  groupCount?: (count: number) => React.ReactNode
  resizable?: boolean
  pinned?: string[]
  evenColumns?: boolean
}

const ROW_PX = 48
const LOADING_ROWS = 4

function leafCount<R extends { subRows: R[] }>(row: R): number {
  return row.subRows.reduce((sum, sub) => sum + (sub.subRows.length ? leafCount(sub) : 1), 0)
}

function PinShadow() {
  return (
    <span
      aria-hidden
      data-part="pin-shadow"
      className="pointer-events-none absolute inset-y-0 -right-xs w-xs bg-linear-to-r from-(--floating-shadow) to-transparent"
    />
  )
}

export function DataTable<T extends RowData, M extends DataTableColumnMeta = DataTableColumnMeta>({
  columns,
  data,
  label,
  getRowId,
  title,
  actions,
  onDelete,
  toolbar,
  bordered = true,
  layout = 'desktop',
  mobileRow,
  empty,
  loading = false,
  error,
  className,
  selectable = false,
  onRowSelectionChange,
  sorting: controlledSorting,
  onSortingChange,
  total: serverTotal,
  onRowClick,
  pageSize,
  pageSizes,
  page,
  pageCount,
  onPageChange,
  scrolling = 'paginated',
  renderExpanded,
  grouping,
  groupCount = (count) => String(count),
  resizable = false,
  pinned,
  evenColumns = false,
}: DataTableProps<T, M>) {
  type F = DataTableFeatures<M>
  const mobile = layout === 'mobile'
  const virtualized = scrolling === 'virtualized'
  const server = !virtualized && pageCount != null && onPageChange != null
  const paged = !virtualized && !server && pageSize != null
  const expandable = renderExpanded != null
  const helper = React.useMemo(() => createColumnHelper<F, T>(), [])
  const [details, setDetails] = React.useState<ReadonlySet<string>>(() => new Set())
  const detailsRef = React.useRef(details)
  detailsRef.current = details
  const toggleDetail = React.useCallback((id: string) => {
    setDetails((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const tableColumns = React.useMemo<DataTableColumn<T, M>[]>(() => {
    const lead: DataTableColumn<T, M>[] = []
    if (selectable) {
      lead.push(
        helper.display({
          id: SELECT_COLUMN_ID,
          enableHiding: false,
          enableResizing: false,
          header: ({ table }) => (
            <Checkbox
              checked={
                table.getIsAllRowsSelected()
                  ? true
                  : table.getIsSomeRowsSelected()
                    ? 'indeterminate'
                    : false
              }
              onCheckedChange={(value) => table.toggleAllRowsSelected(value === true)}
              aria-label="Select all rows"
            />
          ),
          cell: ({ row }) => (
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(value === true)}
              aria-label="Select row"
            />
          ),
        }) as DataTableColumn<T, M>
      )
    }
    if (expandable) {
      lead.push(
        helper.display({
          id: EXPAND_COLUMN_ID,
          enableHiding: false,
          enableResizing: false,
          header: () => <span className="sr-only">Details</span>,
          cell: ({ row }) => {
            const open = detailsRef.current.has(row.id)
            const Icon = open ? ChevronDown : ChevronRight
            return (
              <button
                type="button"
                aria-expanded={open}
                aria-label={open ? 'Collapse row' : 'Expand row'}
                onClick={(event) => {
                  event.stopPropagation()
                  toggleDetail(row.id)
                }}
                className="inline-flex cursor-pointer items-center rounded-sm text-muted-foreground hover:text-foreground focus-ring"
              >
                <Icon aria-hidden className="size-md" />
              </button>
            )
          },
        }) as DataTableColumn<T, M>
      )
    }
    return lead.length ? [...lead, ...columns] : columns
  }, [columns, helper, selectable, expandable, toggleDetail])

  const [innerSorting, setInnerSorting] = React.useState<SortingState>([])
  const manualSorting = controlledSorting !== undefined
  const sorting = controlledSorting ?? innerSorting
  const setSorting = (updater: SortingState | ((old: SortingState) => SortingState)) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater
    if (manualSorting) onSortingChange?.(next)
    else setInnerSorting(next)
  }
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = React.useState<ColumnVisibilityState>({})
  const groupingKey = (grouping ?? []).join('\u0000')
  const [expanded, setExpanded] = React.useState<ExpandedState>(grouping?.length ? true : {})
  const [expandedFor, setExpandedFor] = React.useState(groupingKey)
  if (expandedFor !== groupingKey) {
    setExpandedFor(groupingKey)
    setExpanded(grouping?.length ? true : {})
  }
  const metaHidden = React.useMemo(() => {
    const hidden: ColumnVisibilityState = {}
    for (const column of columns) {
      if (!column.meta?.hidden) continue
      const id = column.id ?? ('accessorKey' in column ? String(column.accessorKey) : undefined)
      if (id) hidden[id] = false
    }
    return hidden
  }, [columns])
  const [clientPage, setClientPage] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: paged ? pageSize : Infinity,
  })
  const serverPageIndex = (page ?? 1) - 1
  const serverPageSize = Math.max(1, data.length)
  const serverPagination = React.useMemo<PaginationState>(
    () => ({ pageIndex: serverPageIndex, pageSize: serverPageSize }),
    [serverPageIndex, serverPageSize]
  )
  const pagination: PaginationState = server ? serverPagination : clientPage
  const groupingState = React.useMemo(
    () => (groupingKey ? groupingKey.split('\u0000') : NO_IDS),
    [groupingKey]
  )
  const pinnedKey = (pinned ?? []).join('\u0000')
  const pinningState = React.useMemo(
    () => ({ start: pinnedKey ? pinnedKey.split('\u0000') : NO_IDS, end: NO_IDS }),
    [pinnedKey]
  )
  const visibilityState = React.useMemo(
    () => ({ ...columnVisibility, ...metaHidden }),
    [columnVisibility, metaHidden]
  )

  const table = useTable<F, T>({
    features: features as unknown as F,
    columns: tableColumns,
    data,
    getRowId,
    defaultColumn: { enableSorting: false, enableColumnFilter: false },
    sortDescFirst: false,
    manualSorting,
    enableSortingRemoval: !manualSorting,
    enableRowSelection: selectable,
    enableColumnResizing: resizable,
    columnResizeMode: 'onChange',
    groupedColumnMode: false,
    manualPagination: server,
    pageCount: server ? pageCount : undefined,
    autoResetPageIndex: false,
    autoResetExpanded: false,
    state: {
      sorting,
      columnFilters,
      rowSelection,
      columnVisibility: visibilityState,
      pagination,
      expanded,
      grouping: groupingState,
      columnPinning: pinningState,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    onExpandedChange: setExpanded,
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function' ? updater(pagination) : updater
      if (server) onPageChange?.(next.pageIndex + 1)
      else setClientPage(next)
    },
  })

  const rows = table.getRowModel().rows
  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original)
  const columnCount = table.getVisibleLeafColumns().length
  const lastPage = Math.max(0, table.getPageCount() - 1)

  React.useEffect(() => {
    if (server || clientPage.pageIndex <= lastPage) return
    setClientPage((current) => ({ ...current, pageIndex: lastPage }))
  }, [server, clientPage.pageIndex, lastPage])
  const lastPinned = table.getStartVisibleLeafColumns().at(-1)?.id
  const sized = resizable || (pinned?.length ?? 0) > 0

  const selectionChange = React.useRef(onRowSelectionChange)
  selectionChange.current = onRowSelectionChange
  const selectedNow = React.useRef(selectedRows)
  selectedNow.current = selectedRows
  const selectedKey = table
    .getSelectedRowModel()
    .rows.map((row) => row.id)
    .join('\u0000')
  React.useEffect(() => {
    selectionChange.current?.(selectedNow.current)
  }, [selectedKey])

  const viewportRef = React.useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: virtualized ? rows.length : 0,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => ROW_PX,
    overscan: 8,
  })
  const windowed = virtualized ? virtualizer.getVirtualItems() : []
  const padTop = windowed[0]?.start ?? 0
  const padBottom = windowed.length
    ? virtualizer.getTotalSize() - (windowed[windowed.length - 1]?.end ?? 0)
    : 0
  const visible = virtualized ? windowed.map((item) => rows[item.index]!) : rows

  const slot =
    actions === undefined ? (
      <TableActions
        selected={selectedRows.length > 0}
        onDelete={onDelete ? () => onDelete(selectedRows) : undefined}
      />
    ) : typeof actions === 'function' ? (
      actions({ selected: selectedRows })
    ) : (
      actions
    )

  const counted = server && serverTotal != null
  const total = counted ? serverTotal : data.length
  const rangeSize = counted ? (pageSize ?? data.length) : pagination.pageSize
  const first = data.length === 0 ? 0 : pagination.pageIndex * rangeSize + 1
  const last = counted
    ? Math.min(total, pagination.pageIndex * rangeSize + data.length)
    : Math.min(total, (pagination.pageIndex + 1) * pagination.pageSize)

  const pinStyle = (column: Column<F, T, unknown>): React.CSSProperties | undefined => {
    const style: React.CSSProperties = {}
    if (sized) style.width = column.getSize()
    else if (evenColumns) style.width = `${100 / Math.max(1, columnCount)}%`
    if (column.getIsPinned() === 'start') style.insetInlineStart = `${column.getStart('start')}px`
    return Object.keys(style).length ? style : undefined
  }
  const pinClass = (column: Column<F, T, unknown>) =>
    column.getIsPinned() === 'start' &&
    'sticky z-1 bg-(--table-fill) [tbody>tr:hover>&]:bg-highest [tr[data-state=selected]>&]:bg-surface-raised'
  const pinEdge = (column: Column<F, T, unknown>) =>
    column.id === lastPinned ? <PinShadow /> : null

  const cellsOf = (row: Row<F, T>): DataTableCell<M>[] =>
    row
      .getVisibleCells()
      .filter((cell) => !cell.column.id.startsWith('__'))
      .map((cell: Cell<F, T, unknown>) => {
        const header = cell.column.columnDef.header
        return {
          id: cell.column.id,
          label: typeof header === 'string' ? header : undefined,
          meta: cell.column.columnDef.meta,
          content: <table.FlexRender cell={cell} />,
        }
      })

  const rowHandlers = (row: Row<F, T>) =>
    onRowClick
      ? {
          onClick: () => onRowClick(row.original),
          onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
            if (event.target !== event.currentTarget) return
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            onRowClick(row.original)
          },
          tabIndex: 0,
        }
      : {}

  const groupRow = (row: Row<F, T>) => {
    const open = row.getIsExpanded()
    const value = String(row.groupingValue ?? '')
    const Icon = open ? ChevronDown : ChevronRight
    return (
      <TableRow
        key={row.id}
        data-part="group-row"
        className="h-9 bg-surface-soft hover:bg-surface-soft"
      >
        <TableCell colSpan={columnCount}>
          <span className="flex items-center gap-xs">
            <button
              type="button"
              aria-expanded={open}
              aria-label={`${open ? 'Collapse' : 'Expand'} ${value}`}
              onClick={() => row.toggleExpanded()}
              className="inline-flex cursor-pointer items-center rounded-sm text-muted-foreground hover:text-foreground focus-ring"
            >
              <Icon aria-hidden className="size-md" />
            </button>
            <span className="font-medium text-foreground">{value}</span>
            <span className="text-muted-foreground">{groupCount(leafCount(row))}</span>
          </span>
        </TableCell>
      </TableRow>
    )
  }

  const bodyRows = visible.map((row) => {
    if (row.getIsGrouped()) return groupRow(row)
    return (
      <React.Fragment key={row.id}>
        <TableRow
          selected={selectable ? row.getIsSelected() : undefined}
          interactive={onRowClick != null}
          {...rowHandlers(row)}
        >
          {row.getVisibleCells().map((cell) => {
            const meta = cell.column.columnDef.meta
            return (
              <TableCell
                key={cell.id}
                numeric={meta?.numeric}
                primary={meta?.primary}
                fill={meta?.fill}
                className={cn(pinClass(cell.column))}
                style={pinStyle(cell.column)}
              >
                <table.FlexRender cell={cell} />
                {pinEdge(cell.column)}
              </TableCell>
            )
          })}
        </TableRow>
        {expandable && details.has(row.id) && (
          <TableRow data-part="expanded-row" className="hover:bg-transparent">
            <TableCell colSpan={columnCount} className="py-sm whitespace-normal">
              {renderExpanded(row.original)}
            </TableCell>
          </TableRow>
        )}
      </React.Fragment>
    )
  })

  const desktop = (
    <Table
      aria-label={label}
      bare
      aria-busy={loading || undefined}
      style={sized ? { width: table.getTotalSize(), tableLayout: 'fixed' } : undefined}
    >
      <TableHeader className={cn(virtualized && 'sticky top-0 z-10')}>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const canSort = header.column.getCanSort()
              const sortDirection = header.column.getIsSorted()
              const meta = header.column.columnDef.meta
              const name = header.column.columnDef.header
              const canResize = resizable && header.column.getCanResize()
              return (
                <TableHead
                  key={header.id}
                  numeric={meta?.numeric}
                  fill={meta?.fill}
                  sorted={canSort ? (sortDirection === false ? null : sortDirection) : undefined}
                  onSort={canSort ? () => header.column.toggleSorting() : undefined}
                  className={cn(pinClass(header.column))}
                  style={pinStyle(header.column)}
                  resize={
                    canResize
                      ? {
                          label: typeof name === 'string' ? name : header.column.id,
                          onStart: (event) => header.getResizeHandler()(event),
                          active: header.column.getIsResizing(),
                        }
                      : undefined
                  }
                >
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  {pinEdge(header.column)}
                </TableHead>
              )
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {loading ? (
          Array.from({ length: LOADING_ROWS }, (_, index) => (
            <TableRow key={`loading-${index}`} aria-hidden={index > 0 || undefined}>
              <TableCell colSpan={columnCount}>
                {index === 0 ? (
                  <div role="status" aria-label={`Loading ${label}`}>
                    <Skeleton />
                  </div>
                ) : (
                  <Skeleton />
                )}
              </TableCell>
            </TableRow>
          ))
        ) : error != null ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={columnCount} className="py-md">
              <Alert intent="danger" title={error} />
            </TableCell>
          </TableRow>
        ) : rows.length === 0 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={columnCount} className="whitespace-normal">
              {empty === undefined ? 'No results.' : empty}
            </TableCell>
          </TableRow>
        ) : (
          <>
            {padTop > 0 && (
              <tr aria-hidden style={{ height: padTop }}>
                <td colSpan={columnCount} />
              </tr>
            )}
            {bodyRows}
            {padBottom > 0 && (
              <tr aria-hidden style={{ height: padBottom }}>
                <td colSpan={columnCount} />
              </tr>
            )}
          </>
        )}
      </TableBody>
    </Table>
  )

  const defaultMobileRow = (cells: DataTableCell<M>[]) => {
    const [head, ...rest] = cells
    return (
      <div className="flex flex-col gap-xs p-sm">
        {head && (
          <div className="truncate text-small font-medium text-foreground">{head.content}</div>
        )}
        {rest.map((cell) => (
          <div key={cell.id} className="flex items-center justify-between gap-xs">
            <span className="text-micro text-muted-foreground">{cell.label}</span>
            <span
              className={cn(
                'text-right text-small',
                cell.meta?.numeric && 'tabular-nums',
                cell.meta?.primary ? 'font-medium text-foreground' : 'text-muted-foreground'
              )}
            >
              {cell.content}
            </span>
          </div>
        ))}
      </div>
    )
  }

  const mobileList = loading ? (
    <div role="status" aria-label={`Loading ${label}`} className="flex flex-col gap-md p-sm">
      {Array.from({ length: LOADING_ROWS }, (_, index) => (
        <Skeleton key={index} />
      ))}
    </div>
  ) : error != null ? (
    <div className="p-sm">
      <Alert intent="danger" title={error} />
    </div>
  ) : rows.length === 0 ? (
    <div className="p-sm">{empty === undefined ? 'No results.' : empty}</div>
  ) : (
    <ul role="list" aria-label={label} className="flex flex-col">
      {visible
        .filter((row) => !row.getIsGrouped())
        .map((row, index) => {
          const cells = cellsOf(row)
          return (
            <li
              key={row.id}
              data-state={selectable && row.getIsSelected() ? 'selected' : undefined}
              className={cn(
                'data-[state=selected]:bg-surface-raised',
                onRowClick && 'cursor-pointer hover:bg-highest focus-ring'
              )}
              {...rowHandlers(row)}
            >
              {index > 0 && (
                <div aria-hidden data-part="row-divider" className="px-md">
                  <div className="h-px w-full bg-border" />
                </div>
              )}
              {selectable ? (
                <div className="flex items-start gap-xs pl-md">
                  <div className="pt-sm">
                    <Checkbox
                      checked={row.getIsSelected()}
                      onCheckedChange={(value) => row.toggleSelected(value === true)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label="Select row"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    {mobileRow ? mobileRow(row.original, cells) : defaultMobileRow(cells)}
                  </div>
                </div>
              ) : mobileRow ? (
                mobileRow(row.original, cells)
              ) : (
                defaultMobileRow(cells)
              )}
            </li>
          )
        })}
    </ul>
  )

  const content = mobile ? mobileList : desktop
  const showFooter =
    (paged || server) && !loading && error == null && total > 0 && (!server || (pageCount ?? 0) > 0)
  const showCount = paged || counted

  return (
    <div
      className={cn(
        'flex w-full flex-col',
        bordered
          ? 'overflow-hidden rounded-lg border border-border bg-card [--table-fill:var(--color-card)]'
          : '[--table-fill:var(--color-background)]',
        className
      )}
    >
      {title != null && (
        <>
          <div className="flex items-center gap-xs px-md py-sm">
            <h2 className="text-body font-medium text-foreground">{title}</h2>
            {selectable && (
              <p
                aria-live="polite"
                data-part="selected-count"
                className="text-small text-muted-foreground"
              >
                {selectedRows.length > 0 ? `${selectedRows.length} selected` : ''}
              </p>
            )}
            {slot != null && <div className="ml-auto flex items-center">{slot}</div>}
          </div>
          <div aria-hidden data-part="title-divider" className="h-px w-full bg-border" />
        </>
      )}
      {toolbar != null && (
        <>
          <div data-part="toolbar" className="px-md py-md">
            {toolbar}
          </div>
          <div aria-hidden data-part="toolbar-divider" className="h-px w-full bg-border" />
        </>
      )}
      {virtualized ? (
        <div ref={viewportRef} data-part="viewport" className="min-h-0 flex-1 overflow-y-auto">
          {content}
        </div>
      ) : (
        content
      )}
      {showFooter && (
        <div className="@container px-md py-sm">
          <div
            className={cn(
              'flex flex-nowrap items-center justify-center gap-sm',
              showCount && '@xl:justify-between'
            )}
          >
            {showCount && (
              <div data-part="count" className="hidden items-center gap-md @xl:flex">
                <p
                  aria-live="polite"
                  className="flex items-center gap-2xs whitespace-nowrap text-small"
                >
                  <span className="text-muted-foreground">Showing</span>
                  <span className="text-foreground">{`${first}–${last}`}</span>
                  <span className="text-muted-foreground">of</span>
                  <span className="text-foreground">{total}</span>
                </p>
                {pageSizes != null && pageSizes.length > 0 && (
                  <Select
                    placeholder="Rows per page"
                    items={pageSizes.map((size) => ({
                      value: String(size),
                      label: `${size} per page`,
                    }))}
                    value={String(pagination.pageSize)}
                    onValueChange={(value) => table.setPageSize(Number(value))}
                    className="w-37.5"
                  />
                )}
              </div>
            )}
            <Pagination
              page={pagination.pageIndex + 1}
              pageCount={Math.max(1, server ? (pageCount ?? 1) : table.getPageCount())}
              onPageChange={(next) => table.setPageIndex(next - 1)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
