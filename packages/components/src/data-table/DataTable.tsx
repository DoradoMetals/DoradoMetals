'use client'

import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type PaginationState,
  type RowData,
  type RowSelectionState,
  type SortingState,
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'

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
}

const features = tableFeatures({
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
  columnMeta: {} as DataTableColumnMeta,
})

export type DataTableColumn<T extends RowData> = ColumnDef<typeof features, T>

const SELECT_COLUMN_ID = '__select'

export type DataTableActionsContext<T> = { selected: T[] }

// Table 1101:444 (ruling 157, refined 2026-10-19). One table for every list.
// Title row (title, selected count, actions slot) over a divider; one optional
// toolbar slot; the body (column heads on the card surface, rows, and the
// Empty, Loading and Error states inside it); the footer (Showing N of M,
// pagination, page size) or, for Scrolling=Virtualized, a scrolling viewport
// and no footer. Search, filters and sort controls are not part of the Table:
// on a list screen they live in the Admin Header, in a card in the toolbar.
export type DataTableProps<T extends RowData> = {
  columns: DataTableColumn<T>[]
  data: T[]
  label: string
  getRowId?: (row: T, index: number) => string
  title?: React.ReactNode
  /** The title row's actions slot. Default Table Actions (Delete only); null hides it. */
  actions?: React.ReactNode | ((context: DataTableActionsContext<T>) => React.ReactNode)
  onDelete?: (rows: T[]) => void
  toolbar?: React.ReactNode
  inCard?: boolean
  empty?: React.ReactNode
  loading?: boolean
  error?: React.ReactNode
  className?: string
  selectable?: boolean
  onRowSelectionChange?: (rows: T[]) => void
  onRowClick?: (row: T) => void
  pageSize?: number
  pageSizes?: number[]
  scrolling?: 'paginated' | 'virtualized'
}

const ROW_PX = 48
const LOADING_ROWS = 4

export function DataTable<T extends RowData>({
  columns,
  data,
  label,
  getRowId,
  title,
  actions,
  onDelete,
  toolbar,
  inCard = true,
  empty,
  loading = false,
  error,
  className,
  selectable = false,
  onRowSelectionChange,
  onRowClick,
  pageSize,
  pageSizes,
  scrolling = 'paginated',
}: DataTableProps<T>) {
  const virtualized = scrolling === 'virtualized'
  const paged = !virtualized && pageSize != null
  const helper = React.useMemo(() => createColumnHelper<typeof features, T>(), [])

  const tableColumns = React.useMemo<DataTableColumn<T>[]>(() => {
    if (!selectable) return columns
    return [
      helper.display({
        id: SELECT_COLUMN_ID,
        enableHiding: false,
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
      }),
      ...columns,
    ]
  }, [columns, helper, selectable])

  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = React.useState<ColumnVisibilityState>({})
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: paged ? pageSize : Infinity,
  })

  const table = useTable<typeof features, T>({
    features,
    columns: tableColumns,
    data,
    getRowId,
    defaultColumn: { enableSorting: false, enableColumnFilter: false },
    sortDescFirst: false,
    enableRowSelection: selectable,
    state: { sorting, columnFilters, rowSelection, columnVisibility, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
  })

  const rows = table.getRowModel().rows
  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original)
  const columnCount = table.getAllLeafColumns().length

  React.useEffect(() => {
    if (!onRowSelectionChange) return
    onRowSelectionChange(selectedRows)
  }, [rowSelection, data, onRowSelectionChange])

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

  const total = data.length
  const first = total === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1
  const last = Math.min(total, (pagination.pageIndex + 1) * pagination.pageSize)

  const body = (
    <Table aria-label={label} bare aria-busy={loading || undefined}>
      <TableHeader className={cn(virtualized && 'sticky top-0 z-10')}>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const canSort = header.column.getCanSort()
              const sortDirection = header.column.getIsSorted()
              const meta = header.column.columnDef.meta
              return (
                <TableHead
                  key={header.id}
                  numeric={meta?.numeric}
                  fill={meta?.fill}
                  sorted={canSort ? (sortDirection === false ? null : sortDirection) : undefined}
                  onSort={canSort ? () => header.column.toggleSorting() : undefined}
                >
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
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
            <TableCell colSpan={columnCount}>{empty ?? 'No results.'}</TableCell>
          </TableRow>
        ) : (
          <>
            {padTop > 0 && (
              <tr aria-hidden style={{ height: padTop }}>
                <td colSpan={columnCount} />
              </tr>
            )}
            {visible.map((row) => (
              <TableRow
                key={row.id}
                selected={selectable ? row.getIsSelected() : undefined}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.target !== event.currentTarget) return
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        onRowClick(row.original)
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                interactive={onRowClick != null}
              >
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta
                  return (
                    <TableCell
                      key={cell.id}
                      numeric={meta?.numeric}
                      primary={meta?.primary}
                      fill={meta?.fill}
                    >
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
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

  return (
    <div
      className={cn(
        'flex w-full flex-col',
        inCard && 'overflow-hidden rounded-lg border border-border bg-card',
        className
      )}
    >
      {title != null && (
        <>
          <div className="flex items-center gap-xs px-md py-sm">
            <h2 className="text-body font-medium text-foreground">{title}</h2>
            {selectable && selectedRows.length > 0 && (
              <p className="text-small text-muted-foreground">{selectedRows.length} selected</p>
            )}
            {slot != null && <div className="ml-auto flex items-center">{slot}</div>}
          </div>
          <div aria-hidden data-part="title-divider" className="h-px w-full bg-border" />
        </>
      )}
      {toolbar}
      {virtualized ? (
        <div ref={viewportRef} data-part="viewport" className="min-h-0 flex-1 overflow-y-auto">
          {body}
        </div>
      ) : (
        body
      )}
      {paged && !loading && error == null && total > 0 && (
        // Two layouts, never stacked (Jacob 2026-10-19): wide, the count left
        // and the pagination right; narrow, the pagination alone, centred.
        <div className="@container px-md py-sm">
          <div className="flex flex-nowrap items-center justify-center gap-sm @xl:justify-between">
            <div data-part="count" className="hidden items-center gap-md @xl:flex">
              <p className="flex items-center gap-2xs whitespace-nowrap text-small">
                <span className="text-muted-foreground">Showing</span>
                <span className="text-foreground">{`${first}\u2013${last}`}</span>
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
            <Pagination
              page={pagination.pageIndex + 1}
              pageCount={Math.max(1, table.getPageCount())}
              onPageChange={(page) => table.setPageIndex(page - 1)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
