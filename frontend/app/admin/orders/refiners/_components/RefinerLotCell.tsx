'use client'

import * as React from 'react'
import { Input } from '@dorado/components'

export type RefinerLotCellProps = {
  label: string
  value: string
  unit: string
  editable: boolean
  onCommit: (text: string) => void
}

export function RefinerLotCell({ label, value, unit, editable, onCommit }: RefinerLotCellProps) {
  if (!editable) {
    return (
      <span className="text-small font-medium text-foreground tabular-nums">
        {value === '—' ? value : `${value}${unit === '%' ? '%' : ` ${unit}`}`}
      </span>
    )
  }
  return (
    <Input
      aria-label={label}
      inputMode="decimal"
      defaultValue={value === '—' ? '' : value}
      trailing={<span className="text-micro text-muted-foreground">{unit}</span>}
      className="w-[100px]"
      onBlur={(event) => {
        const next = event.currentTarget.value
        if (next !== (value === '—' ? '' : value)) onCommit(next)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}
