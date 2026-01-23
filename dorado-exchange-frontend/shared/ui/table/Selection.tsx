// shared/ui/table/selection/RowSelection.tsx
'use client'

import type { Row, Table as TanTable } from '@tanstack/react-table'
import { Checkbox } from '@/shared/ui/base/checkbox'

export function RowSelectionCell<TData>({ row }: { row: Row<TData> }) {
  return (
    <Checkbox
      checked={row.getIsSelected()}
      onCheckedChange={(v) => row.toggleSelected(!!v)}
      aria-label="Select row"
      className="cursor-pointer on-glass"
    />
  )
}

export function HeaderSelectionCell<TData>({ table }: { table: TanTable<TData> }) {
  return (
    <Checkbox
      checked={table.getIsAllPageRowsSelected()}
      onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
      aria-label="Select all rows"
      className="cursor-pointer on-glass"
    />
  )
}
