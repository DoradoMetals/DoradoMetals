'use client'

import { cn } from '@/shared/utils/cn'
import { Button } from '@dorado/components'
import { LEAD_PRIORITIES, LeadPriority } from '@/features/leads/types'

// The three hand-rolled tinted glass segments are the Button intent axis
// (ruling 25): High is danger, Low is success, Medium is the neutral middle.
// Selected = `secondary` (outlined in the intent colour, which is what the
// tinted glass chip was reaching for); unselected = `tertiary`.
const PRIORITY_INTENT: Record<LeadPriority, 'danger' | 'neutral' | 'success'> = {
  High: 'danger',
  Medium: 'neutral',
  Low: 'success',
}

export function PrioritySelect({
  value,
  onChange,
  className,
}: {
  value: LeadPriority
  onChange: (next: LeadPriority) => void
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-3 w-full gap-1', className)}>
      {LEAD_PRIORITIES.map((p) => (
        <Button
          key={p}
          type="button"
          variant={value === p ? 'secondary' : 'tertiary'}
          intent={value === p ? PRIORITY_INTENT[p] : 'neutral'}
          aria-pressed={value === p}
          onClick={() => onChange(p)}
          className="w-full"
        >
          {p}
        </Button>
      ))}
    </div>
  )
}
