// TableBase.tsx
'use client'

import type { Row, Table as TanTable, Cell } from '@tanstack/react-table'
import { flexRender } from '@tanstack/react-table'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/base/table'
import { cn } from '@/shared/utils/cn'

import type { GroupColumnSpec } from '@/shared/ui/table/RowGroups'
import { RowGroups } from '@/shared/ui/table/RowGroups'

function orderSelectFirst<TData>(cols: { id: string }[]) {
  const hasSelect = cols.some((c) => c.id === '__select')
  if (!hasSelect) return cols
  const select = cols.find((c) => c.id === '__select')!
  return [select, ...cols.filter((c) => c.id !== '__select')]
}

export function TableBase<TData>({
  table,
  showHeaders,
  onRowClick,
  getRowClassName,
  groupSpec,
  groupLabelText,
}: {
  table: TanTable<TData>
  showHeaders: boolean
  onRowClick?: (row: Row<TData>) => void
  getRowClassName?: (row: Row<TData>) => string | undefined
  groupSpec?: GroupColumnSpec<TData>[]
  groupLabelText?: (row: Row<TData>) => React.ReactNode
}) {
  const orderedCols = orderSelectFirst(table.getVisibleLeafColumns())
  const orderedColIds = orderedCols.map((c) => c.id)

  return (
    <div className="min-h-[55vh] max-h-[55vh] overflow-y-auto rounded-lg">
      <Table className="w-full">
        {showHeaders ? (
          <TableHeader className="sticky top-0 z-10">
            <TableRow>
              {orderedCols.map((col) => {
                const header = table.getHeaderGroups().at(-1)?.headers.find((h) => h.column.id === col.id)
                return (
                  <TableHead key={col.id} className="h-10 text-xs font-normal text-neutral-600">
                    {header?.isPlaceholder
                      ? null
                      : header
                      ? flexRender(header.column.columnDef.header, header.getContext())
                      : null}
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
        ) : null}

        <TableBody>
          {table.getRowModel().rows.map((row) => {
            const isGroupRow =
              (row as any).getIsGrouped?.() ||
              row.getVisibleCells().some((c: any) => c.getIsGrouped?.())

            if (isGroupRow && groupSpec?.length) {
              return (
                <TableRow key={row.id}>
                  <RowGroups
                    row={row}
                    visibleColumnIds={orderedColIds}
                    spec={groupSpec}
                    labelText={groupLabelText}
                  />
                </TableRow>
              )
            }

            const cells = row.getVisibleCells()
            const cellById = new Map<string, Cell<TData, unknown>>(
              cells.map((c) => [c.column.id, c])
            )

            return (
              <TableRow
                key={row.id}
                className={cn(
                  onRowClick ? 'cursor-pointer' : 'cursor-default',
                  getRowClassName?.(row)
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {orderedColIds.map((colId) => {
                  const cell = cellById.get(colId)
                  return (
                    <TableCell key={colId} className="h-10 py-2 align-middle">
                      {!cell || cell.getIsPlaceholder()
                        ? null
                        : flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  )
                })}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
