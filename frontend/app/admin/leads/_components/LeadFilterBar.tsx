'use client'

import * as React from 'react'
import {
  DateRangePicker,
  RadioGroup,
  RadioOption,
  Select,
  cn,
  type DateRange,
  type SelectItemShape,
} from '@dorado/components'
import type { LeadSummary } from '@dorado/contracts'

import { STATUS_FILTERS, type StatusFilter } from '../_lib'

export const ANY_SOURCE = 'all'
export const ANYONE = 'anyone'
export const UNASSIGNED = 'unassigned'

export type LeadFilterBarProps = {
  layout?: 'desktop' | 'mobile'
  sources: SelectItemShape[]
  assignees: SelectItemShape[]
  source: string
  onSourceChange: (value: string) => void
  assignee: string
  onAssigneeChange: (value: string) => void
  status: StatusFilter
  onStatusChange: (value: StatusFilter) => void
  counts?: LeadSummary['counts_by_status']
  range: DateRange | undefined
  onRangeChange: (value: DateRange | undefined) => void
}

export function LeadFilterBar({
  layout = 'desktop',
  sources,
  assignees,
  source,
  onSourceChange,
  assignee,
  onAssigneeChange,
  status,
  onStatusChange,
  counts,
  range,
  onRangeChange,
}: LeadFilterBarProps) {
  const mobile = layout === 'mobile'
  return (
    <div className={cn('flex gap-lg', mobile ? 'flex-col gap-xs-plus' : 'flex-wrap items-end')}>
      <div className={cn('flex gap-lg', mobile && 'grid grid-cols-2 gap-xs')}>
        <Select
          label="Source"
          items={[{ value: ANY_SOURCE, label: 'All sources' }, ...sources]}
          value={source}
          onValueChange={onSourceChange}
          className={mobile ? undefined : 'w-40'}
        />
        <Select
          label="Assigned to"
          items={[
            { value: ANYONE, label: 'Anyone' },
            { value: UNASSIGNED, label: 'Unassigned' },
            ...assignees,
          ]}
          value={assignee}
          onValueChange={onAssigneeChange}
          className={mobile ? undefined : 'w-40'}
        />
      </div>
      <div className="flex flex-col gap-3xs">
        <span className="micro font-medium text-muted-foreground">Status</span>
        <RadioGroup
          aria-label="Status"
          orientation="horizontal"
          value={status}
          onValueChange={(next) => onStatusChange(next as StatusFilter)}
          className={cn(
            'flex items-center gap-xs',
            mobile
              ? 'no-scrollbar flex-nowrap overflow-x-auto [&>*]:shrink-0 [&>*]:whitespace-nowrap'
              : 'flex-wrap'
          )}
        >
          {STATUS_FILTERS.map((chip) => {
            const count = counts?.[chip.count as keyof LeadSummary['counts_by_status']]
            return (
              <RadioOption key={chip.value} variant="chip" value={chip.value}>
                {count == null ? chip.label : `${chip.label} ${count}`}
              </RadioOption>
            )
          })}
        </RadioGroup>
      </div>
      <DateRangePicker
        label="Date"
        placeholder="Any time"
        value={range}
        onValueChange={onRangeChange}
        className={mobile ? undefined : 'w-60'}
      />
    </div>
  )
}
