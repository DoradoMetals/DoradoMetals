'use client'

import * as React from 'react'
import type { RowData } from '@tanstack/react-table'
import {
  DataTable,
  Text,
  dataTableColumns,
  type DataTableCell,
  type DataTableColumnMeta,
} from '@dorado/components'

export type RecordColumnMeta = DataTableColumnMeta & {
  line?: number
  end?: boolean
  title?: boolean
  cardLabel?: string
  cardCell?: (original: unknown) => React.ReactNode
}

export const recordColumns = <T extends RowData>() => dataTableColumns<T, RecordColumnMeta>()

export type RecordColumn<T extends RowData> = ReturnType<
  ReturnType<typeof recordColumns<T>>['columns']
>[number]

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

function recordCard<T>(original: T, cells: DataTableCell<RecordColumnMeta>[]) {
  const lines = [...new Set(cells.map((cell) => cell.meta?.line ?? 0))].sort((a, b) => a - b)
  const draw = (cell: DataTableCell<RecordColumnMeta>) =>
    cell.meta?.cardCell ? (
      <React.Fragment key={cell.id}>{cell.meta.cardCell(original)}</React.Fragment>
    ) : cell.meta?.title ? (
      <Text key={cell.id} variant="h5" as="h3">
        {cell.content}
      </Text>
    ) : (
      <React.Fragment key={cell.id}>{cell.content}</React.Fragment>
    )
  return (
    <div className="flex flex-col gap-sm px-sm py-xs-plus">
      {lines.map((line) => {
        const onLine = cells.filter((cell) => (cell.meta?.line ?? 0) === line)
        const side = (end: boolean) =>
          onLine.filter((cell) => Boolean(cell.meta?.end || cell.meta?.cardLabel) === end).map(draw)
        return (
          <div key={line} className="flex items-center justify-between gap-xs">
            <div className="flex min-w-0 items-center gap-xs">
              {onLine
                .filter((cell) => cell.meta?.cardLabel)
                .map((cell) => (
                  <Text key={cell.id} variant="micro">
                    {cell.meta?.cardLabel}
                  </Text>
                ))}
              {side(false)}
            </div>
            <div className="flex items-center gap-xs">{side(true)}</div>
          </div>
        )
      })}
    </div>
  )
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
  return (
    <DataTable<T, RecordColumnMeta>
      columns={columns}
      data={data ?? []}
      loading={data === undefined}
      label={label}
      layout={layout === 'cards' ? 'mobile' : 'desktop'}
      mobileRow={recordCard}
      getRowId={getRowId}
      empty={empty}
      bordered={false}
      page={page}
      pageCount={pageCount}
      onPageChange={onPageChange}
      pageSize={pageSize}
      evenColumns={evenColumns}
    />
  )
}
