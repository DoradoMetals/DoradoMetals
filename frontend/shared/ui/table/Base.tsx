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

  // Honor a column's declared `size` as a width so the table doesn't
  // auto-distribute free space unevenly. Only applied when a size was
  // explicitly set, so selection/group columns keep their natural width.
  const widthById = new Map<string, number | undefined>(
    table.getVisibleLeafColumns().map((c) => [c.id, c.columnDef.size])
  )
  const widthStyle = (id: string) => {
    const w = widthById.get(id)
    return w != null ? { width: w } : undefined
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto rounded-lg">
      <Table className="w-full">
        {showHeaders ? (
          <TableHeader className="sticky top-0 z-10">
            <TableRow>
              {orderedCols.map((col) => {
                const header = table.getHeaderGroups().at(-1)?.headers.find((h) => h.column.id === col.id)
                return (
                  <TableHead
                    key={col.id}
                    className="h-10"
                    style={widthStyle(col.id)}
                  >
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
              /* `interactive` IS DERIVED, NOT PASSED. A row is interactive
                 exactly when it has an onRowClick - there is no third state -
                 so asking a call site to declare it a second time is asking it
                 to get it wrong. Six DataTable call sites were hand-rolling
                 `getRowClassName={() => 'cursor-pointer hover:bg-accent'}`,
                 which is byte-for-byte what TableRow's own `interactive` prop
                 emits; those call sites are now straight deletions. */
              <TableRow
                key={row.id}
                interactive={!!onRowClick}
                className={cn(!onRowClick && 'cursor-default', getRowClassName?.(row))}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {orderedColIds.map((colId) => {
                  const cell = cellById.get(colId)
                  return (
                    <TableCell key={colId} className="h-10 py-2 align-middle" style={widthStyle(colId)}>
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
