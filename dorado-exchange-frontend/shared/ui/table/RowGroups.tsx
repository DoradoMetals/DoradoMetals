'use client'

import type { Row } from '@tanstack/react-table'
import { flexRender } from '@tanstack/react-table'
import { useMemo, type ReactNode } from 'react'

import { TableCell } from '@/shared/ui/base/table'
import { Checkbox } from '@/shared/ui/base/checkbox'
import { cn } from '@/shared/utils/cn'
import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react'
import { Button } from '@/shared/ui/base/button'

export type GroupAgg<TData> =
  | { type: 'sum'; from: string }
  | { type: 'min'; from: string }
  | { type: 'max'; from: string }
  | { type: 'first'; from: string }
  | { type: 'count' }
  | { type: 'custom'; render: (row: Row<TData>) => ReactNode }

export type GroupColumnSpec<TData> = {
  id: string
  kind: { type: 'label' } | { type: 'agg'; agg: GroupAgg<TData> } | { type: 'empty' }
  className?: string
}

export type RowGroupsProps<TData> = {
  row: Row<TData>
  visibleColumnIds: string[]
  spec: GroupColumnSpec<TData>[]
  labelText?: (row: Row<TData>) => ReactNode
}

function safeNum(v: unknown) {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function aggValue<TData>(row: Row<TData>, agg: GroupAgg<TData>) {
  const leaf = row.getLeafRows()

  if (agg.type === 'count') return leaf.length
  if (agg.type === 'custom') return agg.render(row)

  const vals = leaf.map((r: any) => r.getValue?.(agg.from) ?? r.original?.[agg.from])

  if (agg.type === 'sum') return vals.reduce((s: number, v: any) => s + safeNum(v), 0)

  const nums = vals.map(safeNum)
  if (!nums.length) return 0

  if (agg.type === 'min') return Math.min(...nums)
  if (agg.type === 'max') return Math.max(...nums)
  if (agg.type === 'first') return vals[0] ?? null

  return null
}

function defaultGroupedLabel<TData>(row: Row<TData>) {
  const groupedCell = row.getVisibleCells().find((c: any) => c.getIsGrouped())
  if (!groupedCell) return row.id
  return flexRender(groupedCell.column.columnDef.cell, groupedCell.getContext())
}

export function RowGroups<TData>({
  row,
  visibleColumnIds,
  spec,
  labelText,
}: RowGroupsProps<TData>) {
  const leafRows = row.getLeafRows()
  const allSelected = leafRows.length > 0 && leafRows.every((r) => r.getIsSelected())

  const byId = new Map(spec.map((s) => [s.id, s]))

  const orderedColumnIds = useMemo(() => {
    if (!visibleColumnIds.includes('__select')) return visibleColumnIds
    return ['__select', ...visibleColumnIds.filter((id) => id !== '__select')]
  }, [visibleColumnIds])

  return (
    <>
      {orderedColumnIds.map((colId) => {
        if (colId === '__select') {
          return (
            <TableCell key={colId} className="h-10 py-2 align-middle">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => {
                  const next = !!v
                  leafRows.forEach((r) => r.toggleSelected(next))
                }}
                aria-label="Select group"
                className="cursor-pointer on-glass"
              />
            </TableCell>
          )
        }

        const s = byId.get(colId)
        if (!s) return <TableCell key={colId} className="h-10 py-2 align-middle" />

        if (s.kind.type === 'empty') {
          return <TableCell key={colId} className={cn('h-10 py-2 align-middle', s.className)} />
        }

        if (s.kind.type === 'label') {
          const label = labelText ? labelText(row) : defaultGroupedLabel(row)
          return (
            <TableCell key={colId} className={cn('h-10 py-2 align-left w-20', s.className)}>
              <Button
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  ;(row as any).getToggleExpandedHandler?.()()
                }}
                className="inline-flex items-center gap-1 p-0"
              >
                <span className="font-semibold text-base text-neutral-900">{label}</span>
                <span className="text-sm text-neutral-600">
                  ({(row as any).subRows?.length ?? 0})
                </span>
                {(row as any).getIsExpanded?.() ? (
                  <CaretDownIcon size={16} />
                ) : (
                  <CaretRightIcon size={16} />
                )}
              </Button>
            </TableCell>
          )
        }

        if (s.kind.type === 'agg') {
          const v = aggValue(row, s.kind.agg)
          return (
            <TableCell key={colId} className={cn('h-10 py-2 align-middle', s.className)}>
              {v as any}
            </TableCell>
          )
        }

        return <TableCell key={colId} className="h-10 py-2 align-middle" />
      })}
    </>
  )
}
