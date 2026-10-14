'use client'

import * as React from 'react'
import {
  type PaginationState,
  type RowData,
  type SortingState,
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import {
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@dorado/components'

export type RecordColumnMeta = {
  numeric?: boolean
  fill?: boolean
  primary?: boolean
  line?: number
  end?: boolean
  title?: boolean
  hidden?: boolean
  cardLabel?: string
  cardCell?: (original: unknown) => React.ReactNode
}

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, datetime: sortFn_datetime },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  columnMeta: {} as RecordColumnMeta,
})

export type RecordColumn<T extends RowData> = ReturnType<
  ReturnType<typeof createColumnHelper<typeof features, T>>['columns']
>[number]

export const recordColumns = <T extends RowData>() => createColumnHelper<typeof features, T>()

export type RecordTableProps<T extends RowData> = {
  columns: RecordColumn<T>[]
  data: T[] | undefined
  label: string
  layout: 'table' | 'cards'
  getRowId?: (row: T, index: number) => string
  empty: React.ReactNode
  page?: number
  pageCount?: number
  onPageChange?: (page: number) => void
  pageSize?: number
  evenColumns?: boolean
}

export function RecordTable<T extends RowData>({
  columns,
  data,
  label,
  layout,
  getRowId,
  empty,
  page,
  pageCount,
  onPageChange,
  pageSize,
  evenColumns = false,
}: RecordTableProps<T>) {
  const server = pageCount != null && onPageChange != null
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [clientPage, setClientPage] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: pageSize ?? Number.MAX_SAFE_INTEGER,
  })
  const pagination: PaginationState = server
    ? { pageIndex: (page ?? 1) - 1, pageSize: data?.length || 1 }
    : clientPage

  const table = useTable<typeof features, T>({
    features,
    columns,
    data: data ?? [],
    getRowId,
    defaultColumn: { enableSorting: false },
    sortDescFirst: false,
    manualPagination: server,
    pageCount: server ? pageCount : undefined,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function' ? updater(pagination) : updater
      if (server) onPageChange?.(next.pageIndex + 1)
      else setClientPage(next)
    },
  })

  if (data === undefined) {
    return (
      <div aria-busy className="flex flex-col gap-md py-sm">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} />
        ))}
      </div>
    )
  }

  if (data.length === 0) return <>{empty}</>

  const rows = table.getRowModel().rows
  const pages = Math.max(1, table.getPageCount())
  const showPager = server || pageSize != null

  return (
    <div className="flex flex-col">
      <Table bare aria-label={label}>
        {layout === 'table' && (
          <TableHeader surface="card">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers
                  .filter((header) => !header.column.columnDef.meta?.hidden)
                  .map((header) => {
                    const canSort = header.column.getCanSort()
                    const direction = header.column.getIsSorted()
                    const meta = header.column.columnDef.meta
                    return (
                      <TableHead
                        key={header.id}
                        style={
                          evenColumns ? { width: `${100 / group.headers.length}%` } : undefined
                        }
                        numeric={meta?.numeric}
                        fill={meta?.fill}
                        sorted={canSort ? (direction === false ? null : direction) : undefined}
                        onSort={canSort ? () => header.column.toggleSorting() : undefined}
                      >
                        {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                      </TableHead>
                    )
                  })}
              </TableRow>
            ))}
          </TableHeader>
        )}
        <TableBody>
          {rows.map((row) =>
            layout === 'table' ? (
              <TableRow key={row.id}>
                {row
                  .getAllCells()
                  .filter((cell) => !cell.column.columnDef.meta?.hidden)
                  .map((cell) => {
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
            ) : (
              <TableRow key={row.id}>
                <TableCell colSpan={row.getAllCells().length} primary>
                  <div className="flex flex-col gap-sm py-xs-plus">
                    {[
                      ...new Set(
                        row.getAllCells().map((cell) => cell.column.columnDef.meta?.line ?? 0)
                      ),
                    ]
                      .sort((a, b) => a - b)
                      .map((line) => {
                        const cells = row
                          .getAllCells()
                          .filter((cell) => (cell.column.columnDef.meta?.line ?? 0) === line)
                        const side = (end: boolean) =>
                          cells
                            .filter(
                              (cell) =>
                                Boolean(
                                  cell.column.columnDef.meta?.end ||
                                  cell.column.columnDef.meta?.cardLabel
                                ) === end
                            )
                            .map((cell) =>
                              cell.column.columnDef.meta?.cardCell ? (
                                <React.Fragment key={cell.id}>
                                  {cell.column.columnDef.meta.cardCell(row.original)}
                                </React.Fragment>
                              ) : cell.column.columnDef.meta?.title ? (
                                <Text key={cell.id} variant="h5" as="h3">
                                  <table.FlexRender cell={cell} />
                                </Text>
                              ) : (
                                <React.Fragment key={cell.id}>
                                  <table.FlexRender cell={cell} />
                                </React.Fragment>
                              )
                            )
                        return (
                          <div key={line} className="flex items-center justify-between gap-xs">
                            <div className="flex min-w-0 items-center gap-xs">
                              {cells
                                .filter((cell) => cell.column.columnDef.meta?.cardLabel)
                                .map((cell) => (
                                  <Text key={cell.id} variant="micro">
                                    {cell.column.columnDef.meta?.cardLabel}
                                  </Text>
                                ))}
                              {side(false)}
                            </div>
                            <div className="flex items-center gap-xs">{side(true)}</div>
                          </div>
                        )
                      })}
                  </div>
                </TableCell>
              </TableRow>
            )
          )}
        </TableBody>
      </Table>
      {showPager && (
        <div className="flex justify-center pt-sm">
          <Pagination
            page={pagination.pageIndex + 1}
            pageCount={pages}
            onPageChange={(next) => table.setPageIndex(next - 1)}
          />
        </div>
      )}
    </div>
  )
}
