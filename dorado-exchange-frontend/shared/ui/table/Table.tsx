'use client'

import {
  ColumnDef,
  ColumnFiltersState,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  PaginationState,
  Row,
  RowSelectionState,
  useReactTable,
} from '@tanstack/react-table'
import { ReactNode, useMemo, useState } from 'react'

import { cn } from '@/shared/utils/cn'
import { TableBase } from '@/shared/ui/table/Base'
import { TablePagination } from '@/shared/ui/table/Pagination'
import { TableToolbar } from '@/shared/ui/table/Toolbar'
import { FilterCard } from '@/shared/ui/table/FilterCards'
import { CreateConfig } from '@/shared/ui/table/CreateDialog'
import { GroupColumnSpec } from '@/shared/ui/table/RowGroups'

type DataTableProps<TData> = {
  data: TData[]
  columns: ColumnDef<TData, any>[]
  initialPageSize?: number

  searchColumnId?: string
  searchPlaceholder?: string
  createIcon?: React.ComponentType<{ size?: number; className?: string }>
  enableColumnVisibility?: boolean
  onRowClick?: (row: Row<TData>) => void

  showCardBackground?: boolean
  filterCards?: FilterCard<TData>[]
  createConfig?: CreateConfig
  footerRightContent?: ReactNode
  hidePagination?: boolean
  showHeaders?: boolean

  wrapperClassName?: string
  getRowClassName?: (row: Row<TData>) => string | undefined
  searchClass?: string
  shadowClass?: string
  columnTriggerClass?: string
  addButtonClass?: string

  enableRowSelection?: boolean
  getRowId?: (originalRow: TData, index: number, parent?: any) => string
  onRowSelectionChange?: (rowSelection: RowSelectionState) => void

  showSelectionBar?: boolean
  selectionReplaceTopRow?: boolean

  selectionShowClear?: boolean
  selectionShowDelete?: boolean
  selectionShowExport?: boolean

  onSelectionDelete?: (selectedRowIds: string[]) => void | Promise<void>
  onSelectionExport?: (selectedRowIds: string[]) => void | Promise<void>

  selectionBarClassName?: string
  selectionActionButtonClassName?: string
  selectionDeleteButtonClassName?: string
  selectionExportButtonClassName?: string
  selectionClearButtonClassName?: string

  enableGrouping?: boolean
  initialGrouping?: string[]
  groupedColumnMode?: false | 'reorder' | 'remove'
  groupSpec?: GroupColumnSpec<TData>[]
  groupLabelText?: (row: Row<TData>) => ReactNode
}

export function DataTable<TData>({
  data,
  columns,
  initialPageSize = 10,
  searchColumnId,
  searchPlaceholder = 'Search...',
  onRowClick,
  filterCards,
  createConfig,
  createIcon,
  footerRightContent,
  hidePagination = true,
  enableColumnVisibility = false,
  showHeaders = true,
  getRowClassName,

  wrapperClassName = 'glass-panel',
  searchClass = 'on-glass',
  shadowClass = '',
  columnTriggerClass = 'on-glass',
  addButtonClass,

  enableRowSelection = false,
  getRowId,
  onRowSelectionChange,
  showSelectionBar = false,
  selectionReplaceTopRow = false,

  selectionShowClear = true,
  selectionShowDelete = false,
  selectionShowExport = false,

  onSelectionDelete,
  onSelectionExport,

  selectionBarClassName,
  selectionActionButtonClassName,
  selectionDeleteButtonClassName,
  selectionExportButtonClassName,
  selectionClearButtonClassName,

  enableGrouping = false,
  initialGrouping = [],
  groupedColumnMode = 'reorder',
  groupSpec,
  groupLabelText,
}: DataTableProps<TData>) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: initialPageSize,
  })
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [activeFilterKey, setActiveFilterKey] = useState<number | string | null>(null)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const [grouping, setGrouping] = useState<string[]>(initialGrouping)
  const [expanded, setExpanded] = useState({})

  const rowsForTable = useMemo(() => {
    if (!filterCards?.length || activeFilterKey == null) return data
    const card = filterCards.find((c) => c.key === activeFilterKey)
    return card ? data.filter((row) => card.predicate(row)) : data
  }, [data, filterCards, activeFilterKey])

  const table = useReactTable({
    data: rowsForTable,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(hidePagination ? {} : { getPaginationRowModel: getPaginationRowModel() }),
    ...(enableGrouping ? { getGroupedRowModel: getGroupedRowModel() } : {}),
    ...(enableGrouping ? { getExpandedRowModel: getExpandedRowModel() } : {}),
    state: {
      ...(hidePagination ? {} : { pagination }),
      columnFilters,
      rowSelection,
      ...(enableGrouping ? { grouping, expanded } : {}),
    },
    onPaginationChange: hidePagination ? undefined : setPagination,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: (updater) => {
      setRowSelection((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        onRowSelectionChange?.(next)
        return next
      })
    },
    enableRowSelection,
    getRowId,
    autoResetPageIndex: false,
    onGroupingChange: enableGrouping ? setGrouping : undefined,
    onExpandedChange: enableGrouping ? setExpanded : undefined,
    groupedColumnMode: enableGrouping ? groupedColumnMode : false,
  })

  const searchColumn = searchColumnId ? (table.getColumn(searchColumnId) ?? null) : null

  return (
    <div
      className={cn(
        'min-h-[75vh] max-h-[75vh] space-y-4 p-4 rounded-lg glass-panel',
        shadowClass,
        wrapperClassName
      )}
    >
      <TableToolbar
        table={table}
        filterCards={filterCards}
        activeFilterKey={activeFilterKey}
        onChangeActiveFilterKey={setActiveFilterKey}
        createConfig={createConfig}
        createIcon={createIcon}
        addButtonClass={addButtonClass}
        searchColumn={searchColumn}
        searchPlaceholder={searchPlaceholder}
        searchClass={searchClass}
        enableColumnVisibility={enableColumnVisibility}
        columnTriggerClass={columnTriggerClass}
        onSearchChange={() => setPagination((prev) => ({ ...prev, pageIndex: 0 }))}
        showSelectionBar={showSelectionBar}
        selectionReplaceTopRow={selectionReplaceTopRow}
        selectionShowClear={selectionShowClear}
        selectionShowDelete={selectionShowDelete}
        selectionShowExport={selectionShowExport}
        onSelectionDelete={onSelectionDelete}
        onSelectionExport={onSelectionExport}
        selectionBarClassName={selectionBarClassName}
        selectionActionButtonClassName={selectionActionButtonClassName}
        selectionDeleteButtonClassName={selectionDeleteButtonClassName}
        selectionExportButtonClassName={selectionExportButtonClassName}
        selectionClearButtonClassName={selectionClearButtonClassName}
      />

      <TableBase
        table={table}
        showHeaders={showHeaders}
        onRowClick={onRowClick}
        getRowClassName={getRowClassName}
        groupSpec={groupSpec}
        groupLabelText={groupLabelText}
      />

      {!hidePagination && <TablePagination table={table} footerRightContent={footerRightContent} />}
    </div>
  )
}
