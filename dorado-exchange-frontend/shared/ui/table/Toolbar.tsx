'use client'

import { AddNew } from '@/shared/ui/table/Create'
import { CreateConfig } from '@/shared/ui/table/CreateDialog'
import { TableColumnVisibility } from '@/shared/ui/table/ColumnVisibility'
import { FilterCard, FilterCards } from '@/shared/ui/table/FilterCards'
import { TableSearch } from '@/shared/ui/table/Search'
import type { Table as TanTable, Column } from '@tanstack/react-table'
import { ReactNode, useState } from 'react'
import { SelectionBar } from '@/shared/ui/table/SelectionBar'

type Props<TData> = {
  table: TanTable<TData>

  filterCards?: FilterCard<TData>[]
  activeFilterKey: number | string | null
  onChangeActiveFilterKey: (k: number | string | null) => void

  createConfig?: CreateConfig
  createIcon?: React.ComponentType<{ size?: number; className?: string }>
  addButtonClass?: string

  searchColumn: Column<TData, unknown> | null
  searchPlaceholder: string
  searchClass: string
  onSearchChange?: () => void

  enableColumnVisibility: boolean
  columnTriggerClass: string

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
}

export function TableToolbar<TData>({
  table,
  filterCards,
  activeFilterKey,
  onChangeActiveFilterKey,

  createConfig,
  createIcon,
  addButtonClass,

  searchColumn,
  searchPlaceholder,
  searchClass,
  onSearchChange,

  enableColumnVisibility,
  columnTriggerClass,

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
}: Props<TData>) {
  const showTopRow = !!(searchColumn || enableColumnVisibility || createConfig)

  const selectedCount = Object.values(table.getState().rowSelection ?? {}).filter(Boolean).length
  const isSelecting = selectedCount > 0
  const showNormalTopRow = showTopRow && (!selectionReplaceTopRow || !isSelecting)

  return (
    <div className="space-y-3 p-4">
      {filterCards?.length ? (
        <FilterCards
          cards={filterCards}
          activeKey={activeFilterKey}
          onChangeActive={onChangeActiveFilterKey}
        />
      ) : null}

      {showNormalTopRow ? (
        <div className="on-glass border-none flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between w-full">
          <div className="flex flex-col gap-2 w-full">
            <div className="flex w-full gap-2">
              {createConfig ? (
                <AddNew
                  createConfig={createConfig}
                  triggerIcon={createIcon}
                  triggerClass={addButtonClass}
                />
              ) : null}

              {searchColumn ? (
                <TableSearch
                  column={searchColumn}
                  placeholder={searchPlaceholder}
                  inputClassname={searchClass}
                  onChange={onSearchChange}
                />
              ) : null}

              {enableColumnVisibility ? (
                <TableColumnVisibility table={table} triggerClass={columnTriggerClass} />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showSelectionBar ? (
        <SelectionBar
          table={table}
          showClear={selectionShowClear}
          showDelete={selectionShowDelete}
          showExport={selectionShowExport}
          onDelete={onSelectionDelete}
          onExport={onSelectionExport}
          barClassName={selectionBarClassName}
          actionButtonClassName={selectionActionButtonClassName}
          deleteButtonClassName={selectionDeleteButtonClassName}
          exportButtonClassName={selectionExportButtonClassName}
          clearButtonClassName={selectionClearButtonClassName}
        />
      ) : null}
    </div>
  )
}
