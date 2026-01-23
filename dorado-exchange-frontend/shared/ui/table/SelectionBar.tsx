'use client'

import type { Table as TanTable } from '@tanstack/react-table'
import { useState } from 'react'
import { Button } from '@/shared/ui/base/button'
import { cn } from '@/shared/utils/cn'

type Props<TData> = {
  table: TanTable<TData>

  showClear?: boolean
  showDelete?: boolean
  showExport?: boolean

  onDelete?: (selectedRowIds: string[]) => void | Promise<void>
  onExport?: (selectedRowIds: string[]) => void | Promise<void>

  labelSelected?: string
  deleteLabel?: string
  exportLabel?: string
  clearLabel?: string

  barClassName?: string
  countClassName?: string
  actionButtonClassName?: string
  deleteButtonClassName?: string
  exportButtonClassName?: string
  clearButtonClassName?: string

  disableActionsWhileLoading?: boolean
  clearSelectionOnDelete?: boolean
  clearSelectionOnExport?: boolean
}

export function SelectionBar<TData>({
  table,

  showClear = true,
  showDelete = false,
  showExport = false,

  onDelete,
  onExport,

  labelSelected = 'selected',
  deleteLabel = 'Delete',
  exportLabel = 'Export',
  clearLabel = 'Clear',

  barClassName,
  countClassName,
  actionButtonClassName,
  deleteButtonClassName,
  exportButtonClassName,
  clearButtonClassName,

  disableActionsWhileLoading = true,
  clearSelectionOnDelete = true,
  clearSelectionOnExport = false,
}: Props<TData>) {
  const [busy, setBusy] = useState<'delete' | 'export' | null>(null)

  const rowSelection = table.getState().rowSelection ?? {}
  const selectedRowIds = Object.keys(rowSelection).filter((k) => rowSelection[k])
  const selectedCount = selectedRowIds.length

  const canDelete = !!onDelete
  const canExport = !!onExport

  const isBusy = busy != null
  const disable = disableActionsWhileLoading && isBusy

  const handleDelete = async () => {
    if (!onDelete || selectedRowIds.length === 0) return
    setBusy('delete')
    try {
      await onDelete(selectedRowIds)
      if (clearSelectionOnDelete) table.resetRowSelection()
    } finally {
      setBusy(null)
    }
  }

  const handleExport = async () => {
    if (!onExport || selectedRowIds.length === 0) return
    setBusy('export')
    try {
      await onExport(selectedRowIds)
      if (clearSelectionOnExport) table.resetRowSelection()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={cn('on-glass border-none flex items-center gap-3', barClassName)}>
      <div className={cn('text-sm text-neutral-700', countClassName)}>
        <span className="font-semibold text-neutral-900">{selectedCount}</span> {labelSelected}
      </div>

      <div className="flex-1" />

      {showExport ? (
        <Button
          size="sm"
          variant="ghost"
          className={cn('on-glass', actionButtonClassName, exportButtonClassName)}
          disabled={disable || !canExport}
          onClick={handleExport}
        >
          {busy === 'export' ? 'Exporting...' : exportLabel}
        </Button>
      ) : null}

      {showDelete ? (
        <Button
          size="sm"
          className={cn('destructive-on-glass', actionButtonClassName, deleteButtonClassName)}
          disabled={disable || !canDelete}
          onClick={handleDelete}
        >
          {busy === 'delete' ? 'Deleting...' : deleteLabel}
        </Button>
      ) : null}

      {showClear ? (
        <Button
          size="sm"
          variant="ghost"
          className={cn('on-glass', actionButtonClassName, clearButtonClassName)}
          disabled={disable}
          onClick={() => table.resetRowSelection()}
        >
          {clearLabel}
        </Button>
      ) : null}
    </div>
  )
}
