import type { LeadStage } from '@dorado/contracts'

import type { LeadBadge } from './format'

export type StatusFilter = 'all' | 'New' | 'Contacted' | 'Converted' | 'Archived'

export const STATUS_FILTERS: { value: StatusFilter; label: string; count: string }[] = [
  { value: 'all', label: 'All', count: 'all' },
  { value: 'New', label: 'New', count: 'new' },
  { value: 'Contacted', label: 'Contacted', count: 'contacted' },
  { value: 'Converted', label: 'Converted', count: 'converted' },
  { value: 'Archived', label: 'Archived', count: 'archived' },
]

export const stageOf = (filter: StatusFilter): LeadStage | null =>
  filter === 'all' || filter === 'Archived' ? null : filter

export const BADGE_INTENT: Record<
  LeadBadge,
  'danger' | 'warning' | 'success' | 'info' | 'neutral'
> = {
  New: 'danger',
  Contacted: 'warning',
  Responded: 'info',
  Converted: 'success',
  Archived: 'neutral',
}
