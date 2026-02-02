'use client'

import type { Column } from '@tanstack/react-table'
import { DebouncedInputSearch } from '../inputs/DebouncedInputSearch'

export type TableSearchProps<TData> = {
  column: Column<TData, unknown>
  placeholder: string
  inputClassname?: string
  onChange?: () => void
}

export function TableSearch<TData>({
  column,
  placeholder,
  inputClassname,
  onChange,
}: TableSearchProps<TData>) {
  return (
    <div className="w-full">
      <DebouncedInputSearch
        type="text"
        inputClassname={inputClassname}
        placeholder={placeholder}
        value={String(column.getFilterValue() ?? '')}
        onChange={(value) => {
          column.setFilterValue(value)
          onChange?.()
        }}
      />
    </div>
  )
}
