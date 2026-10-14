import { Badge, EmptyState, Input, Pagination, Skeleton, Text } from '@dorado/components'
import { Package, Search } from '@dorado/icons'
import type { RateChangeRow } from '@dorado/contracts'

import { Panel } from '@/shared/ui/Panel'
import { capitalize, formatStamp } from '../../_lib'
import { rangeLabel, unitShort } from '../_lib'
import { changeText } from '../_lib'

export type RateChangesPanelProps = {
  rows: RateChangeRow[] | undefined
  mobile: boolean
  search: string
  page: number
  pageCount: number
  onSearch: (value: string) => void
  onPageChange: (page: number) => void
}

const GRID = 'grid grid-cols-[repeat(6,minmax(0,1fr))] gap-sm'
const HEADINGS = ['METAL', 'TYPE', 'RANGE', 'CHANGE', 'SET BY', 'WHEN']

const bandOf = (row: RateChangeRow) =>
  rangeLabel(row.min_qty, row.max_qty, unitShort(row.unit ?? 'troy_oz'))

function Value({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="small-medium" emphasis="default" className="truncate">
      {children}
    </Text>
  )
}

export function RateChangesPanel({
  rows,
  mobile,
  search,
  page,
  pageCount,
  onSearch,
  onPageChange,
}: RateChangesPanelProps) {
  const field = (
    <Input
      aria-label="Search rate changes"
      placeholder="Search metal, band or admin"
      leading={<Search />}
      value={search}
      onChange={(event) => onSearch(event.target.value)}
      className={mobile ? undefined : 'w-90'}
    />
  )

  let body: React.ReactNode
  if (rows === undefined) {
    body = (
      <div aria-busy className="flex flex-col gap-md py-sm">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} />
        ))}
      </div>
    )
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        icon={<Package />}
        title="No rate changes"
        description="Changes show here when an admin saves a metal's rates."
      />
    )
  } else if (mobile) {
    body = (
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-sm py-xs-plus">
            <div className="flex items-center justify-between gap-xs">
              <Text variant="h5" as="h3">
                {row.metal_id ?? '—'}
              </Text>
              <Badge intent="neutral">{capitalize(row.type)}</Badge>
            </div>
            <div className="flex items-center justify-between gap-xs">
              <Text variant="micro">{bandOf(row)}</Text>
              <Value>{changeText(row)}</Value>
            </div>
            <div className="flex items-center justify-between gap-xs">
              <Value>{row.actor_name ?? 'System'}</Value>
              <Text variant="micro">{formatStamp(row.changed_at)}</Text>
            </div>
          </li>
        ))}
      </ul>
    )
  } else {
    body = (
      <ul className="flex flex-col divide-y divide-border">
        <li aria-hidden className={`${GRID} py-xs-plus`}>
          {HEADINGS.map((heading) => (
            <Text key={heading} variant="micro">
              {heading}
            </Text>
          ))}
        </li>
        {rows.map((row) => (
          <li key={row.id} className={`${GRID} items-center py-xs-plus`}>
            <Value>{row.metal_id ?? '—'}</Value>
            <Value>{capitalize(row.type)}</Value>
            <Value>{bandOf(row)}</Value>
            <Value>{changeText(row)}</Value>
            <Value>{row.actor_name ?? 'System'}</Value>
            <Value>{formatStamp(row.changed_at)}</Value>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Panel title="Rate Changes" trailing={mobile ? undefined : field}>
      {mobile && <div className="pb-xs pt-2xs">{field}</div>}
      {body}
      <div className="flex justify-center pt-sm">
        <Pagination page={page} pageCount={pageCount} onPageChange={onPageChange} />
      </div>
    </Panel>
  )
}
