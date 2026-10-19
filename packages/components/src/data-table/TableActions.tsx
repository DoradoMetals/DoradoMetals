'use client'

import * as React from 'react'
import { Download, Trash2, Upload } from '@dorado/icons'

import { Button } from '../button/Button'
import { cn } from '../cn'

export type TableActionsProps = {
  /** One or more rows are checked: Delete turns on (1186:1436). Delete renders only with onDelete. */
  selected?: boolean
  showImport?: boolean
  showExport?: boolean
  onImport?: () => void
  onExport?: () => void
  onDelete?: () => void
  className?: string
}

// Table Actions 1186:1440: the default content of the Table title row's
// actions slot. Import, Export and Delete, each behind its own switch; only
// Delete is on by default, and it is disabled until a row is selected. A
// feature passes its own actions component instead.
export function TableActions({
  selected = false,
  showImport = false,
  showExport = false,
  onImport,
  onExport,
  onDelete,
  className,
}: TableActionsProps) {
  return (
    <div className={cn('flex items-center gap-xs', className)}>
      {showImport && (
        <Button variant="secondary" size="iconSm" aria-label="Import" onClick={onImport}>
          <Upload aria-hidden />
        </Button>
      )}
      {showExport && (
        <Button variant="secondary" size="iconSm" aria-label="Export" onClick={onExport}>
          <Download aria-hidden />
        </Button>
      )}
      {onDelete != null && (
        <Button
          variant="secondary"
          intent="danger"
          size="iconSm"
          aria-label="Delete"
          disabled={!selected}
          onClick={onDelete}
        >
          <Trash2 aria-hidden />
        </Button>
      )}
    </div>
  )
}
