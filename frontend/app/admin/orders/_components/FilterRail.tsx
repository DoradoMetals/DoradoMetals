'use client'

import * as React from 'react'
import { Button, cn } from '@dorado/components'

export type FilterRailSortOption = { value: string; label: React.ReactNode }

export type FilterRailProps = {
  filters: React.ReactNode
  filterLabel?: React.ReactNode
  sortLabel?: React.ReactNode
  sortOptions?: FilterRailSortOption[]
  sortValue?: string
  onSortChange?: (value: string) => void
  count?: React.ReactNode
  onReset?: () => void
  resetLabel?: string
  className?: string
}

export function FilterRail({
  filters,
  filterLabel = 'Filter',
  sortLabel = 'Sort',
  sortOptions,
  sortValue,
  onSortChange,
  count,
  onReset,
  resetLabel = 'Reset',
  className,
}: FilterRailProps) {
  const sortId = React.useId()
  return (
    <aside
      aria-label={typeof filterLabel === 'string' ? filterLabel : undefined}
      className={cn('flex flex-col gap-lg rounded-lg border border-border bg-card p-md', className)}
    >
      <div className="flex flex-col gap-sm">
        <p className="text-micro font-medium text-muted-foreground">{filterLabel}</p>
        {filters}
      </div>
      {sortOptions != null && (
        <div className="flex flex-col gap-sm">
          <p id={sortId} className="text-micro font-medium text-muted-foreground">
            {sortLabel}
          </p>
          <div role="group" aria-labelledby={sortId} className="flex flex-wrap gap-xs">
            {sortOptions.map((option) => (
              <Button
                key={option.value}
                size="sm"
                className="flex-1"
                variant={option.value === sortValue ? 'primary' : 'secondary'}
                aria-pressed={option.value === sortValue}
                onClick={() => onSortChange?.(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      )}
      {(count != null || onReset != null) && (
        <div className="flex items-center justify-between gap-sm">
          <p className="text-micro text-muted-foreground">{count}</p>
          {onReset != null && (
            <Button variant="tertiary" size="sm" onClick={onReset}>
              {resetLabel}
            </Button>
          )}
        </div>
      )}
    </aside>
  )
}
