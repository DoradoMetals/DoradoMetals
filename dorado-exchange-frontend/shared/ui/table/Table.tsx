'use client'

import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  PaginationState,
  Row,
  useReactTable,
} from '@tanstack/react-table'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ReactNode, useState } from 'react'

import { Button } from '@/shared/ui/base/button'
import { Checkbox } from '@/shared/ui/base/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/base/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/base/table'
import { cn } from '@/lib/utils'
import { ColumnsIcon } from '@phosphor-icons/react'
import { DebouncedInputSearch } from '../inputs/DebouncedInputSearch'
import { AddNew, CreateConfig } from './AddNew'
import { FilterCard, FilterCardsStrip } from './FilterCard'

type DataTableProps<TData> = {
  data: TData[]
  columns: ColumnDef<TData, any>[]
  initialPageSize?: number
  searchColumnId?: string
  searchPlaceholder?: string

  createIcon?: React.ComponentType<{ size?: number; className?: string }>

  enableColumnVisibility?: boolean

  onRowClick?: (row: Row<TData>) => void
  getRowClassName?: (row: Row<TData>) => string | undefined

  wrapperClassName?: string
  showCardBackground?: boolean

  filterCards?: FilterCard<TData>[]

  createConfig?: CreateConfig
  footerRightContent?: ReactNode
}

export function DataTable<TData>({
  data,
  columns,
  initialPageSize = 10,
  searchColumnId,
  searchPlaceholder = 'Search...',
  enableColumnVisibility = false,
  onRowClick,
  getRowClassName,
  wrapperClassName,
  showCardBackground = true,
  filterCards,
  createConfig,
  createIcon,
  footerRightContent,
}: DataTableProps<TData>) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: initialPageSize,
  })
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const [activeFilterKey, setActiveFilterKey] = useState<number | string | null>(null)

  const rowsForTable =
    filterCards && activeFilterKey != null
      ? data.filter((row) => {
          const card = filterCards.find((c) => c.key === activeFilterKey)
          return card ? card.predicate(row) : true
        })
      : data

  const table = useReactTable({
    data: rowsForTable,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination, columnFilters },
    onPaginationChange: setPagination,
    onColumnFiltersChange: setColumnFilters,
    autoResetPageIndex: false,
  })

  const searchColumn = searchColumnId ? table.getColumn(searchColumnId) : null

  return (
    <div
      className={cn(
        'space-y-4 w-full h-full bg-card raised-off-page p-4 rounded-lg mb-4',
        wrapperClassName
      )}
    >
      {filterCards && filterCards.length > 0 && (
        <FilterCardsStrip
          cards={filterCards}
          activeKey={activeFilterKey}
          onChangeActive={setActiveFilterKey}
        />
      )}

      {(searchColumn || enableColumnVisibility || createConfig) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between w-full">
          <div className="flex flex-col gap-2 w-full">
            <div className="flex w-full gap-2">
              {createConfig && (
                <AddNew
                  createConfig={createConfig}
                  triggerIcon={createIcon}
                />
              )}

              {searchColumn && (
                <div className="w-full">
                  <DebouncedInputSearch
                    type="text"
                    className="bg-highest"
                    placeholder={searchPlaceholder}
                    value={String(searchColumn.getFilterValue() ?? '')}
                    onChange={(value) => {
                      searchColumn.setFilterValue(value)
                      setPagination((prev) => ({
                        ...prev,
                        pageIndex: 0,
                      }))
                    }}
                  />
                </div>
              )}

              {enableColumnVisibility && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-neutral-800 bg-highest hover:bg-highest border-1 border-border h-10"
                    >
                      <ColumnsIcon size={28} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-fit space-y-2 bg-highest rounded-lg"
                    align="center"
                    side="bottom"
                  >
                    <div className="flex justify-center text-xs text-neutral-600 p-2 bg-neutral-100/70 rounded-t-lg font-light">
                      Toggle Displayed
                    </div>
                    <div className="flex flex-col gap-2 px-2">
                      {table.getAllLeafColumns().map((column) => (
                        <div
                          key={column.id}
                          className="flex items-center gap-4 w-full border-b-1 border-border pb-2"
                        >
                          <Checkbox
                            id={`col-${column.id}`}
                            checked={column.getIsVisible()}
                            onCheckedChange={() => column.toggleVisibility()}
                            className="text-primary cursor-pointer data-[state=checked]:text-primary data-[state=checked]:bg-highest data-[state=checked]:border-border bg-highest border-border border-1"
                          />
                          <label
                            htmlFor={`col-${column.id}`}
                            className="text-xs cursor-pointer text-left text-neutral-800 tracking-wide font-normal"
                          >
                            {typeof column.columnDef.header === 'function'
                              ? column.id
                                  .split('_')
                                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                                  .join(' ')
                              : column.columnDef.header}
                          </label>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-1 justify-center text-xs text-neutral-600 py-1 px-2 rounded-b-lg pb-2 font-light">
                      <span className="text-neutral-900">
                        {table.getAllLeafColumns().filter((col) => !col.getIsVisible()).length}
                      </span>
                      <span>hidden</span>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        </div>
      )}

      <Table className="w-full">
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className="align-middle h-10 text-xs font-normal text-neutral-600 tracking-wide"
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>

        <TableBody className={showCardBackground ? 'bg-card' : undefined}>
          {table.getRowModel().rows.map((row) => {
            const rowCls = getRowClassName?.(row)
            return (
              <TableRow
                key={row.id}
                className={cn('items-center hover:cursor-pointer', rowCls)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="align-middle py-4">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <div className="flex items-center gap-4">
        <div className="flex-1" />

        <div className="flex items-center justify-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <span className="text-sm text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
          </span>

          <Button
            variant="ghost"
            size="icon"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 flex justify-end">{footerRightContent}</div>
      </div>
    </div>
  )
}
