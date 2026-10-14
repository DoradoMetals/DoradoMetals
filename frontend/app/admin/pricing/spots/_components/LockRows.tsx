import { Badge, Button, cn, EmptyState, Pagination, Skeleton, Text } from '@dorado/components'
import { Package } from '@dorado/icons'
import type { SpotLock } from '@dorado/contracts'

import { formatMoney, formatStamp } from '../../_lib'
import { formatQuantity } from '../_lib'

export type LockRowsProps = {
  locks: SpotLock[] | undefined
  showMetal: boolean
  mobile: boolean
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  onUnlock: (lock: SpotLock) => void
}

const HEADINGS = ['ORDER', 'METAL', 'QUANTITY', 'LOCKED AT', 'LOCKED BY', 'WHEN', 'STATUS']

const lockedAt = (lock: SpotLock) => formatMoney(lock.bid ?? lock.ask)

function StatusBadge({ lock }: { lock: SpotLock }) {
  return lock.status === 'active' ? (
    <Badge intent="info">Active</Badge>
  ) : (
    <Badge intent="success">Released</Badge>
  )
}

function UnlockButton({ lock, onUnlock }: { lock: SpotLock; onUnlock: (lock: SpotLock) => void }) {
  if (lock.status !== 'active') return null
  return (
    <Button variant="tertiary" size="sm" onClick={() => onUnlock(lock)}>
      Unlock
    </Button>
  )
}

function Value({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="small-medium" emphasis="default" className="truncate">
      {children}
    </Text>
  )
}

function DesktopRow({
  lock,
  showMetal,
  onUnlock,
  grid,
}: {
  lock: SpotLock
  showMetal: boolean
  onUnlock: (lock: SpotLock) => void
  grid: string
}) {
  return (
    <li className={cn(grid, 'items-center py-xs-plus')}>
      <Value>{lock.reference}</Value>
      {showMetal && <Value>{lock.metal_id}</Value>}
      <Value>{formatQuantity(lock.quantity)}</Value>
      <Value>{lockedAt(lock)}</Value>
      <Value>{lock.locked_by || 'System'}</Value>
      <Value>{formatStamp(lock.created_at)}</Value>
      <span className="flex">
        <StatusBadge lock={lock} />
      </span>
      <span className="flex justify-end">
        <UnlockButton lock={lock} onUnlock={onUnlock} />
      </span>
    </li>
  )
}

function MobileRow({ lock, onUnlock }: { lock: SpotLock; onUnlock: (lock: SpotLock) => void }) {
  return (
    <li className="flex flex-col gap-sm py-xs-plus">
      <div className="flex items-center justify-between gap-xs">
        <Text variant="h5" as="h3">
          {lock.metal_id}
        </Text>
        <StatusBadge lock={lock} />
      </div>
      <div className="flex min-h-(--control-sm) items-center justify-between gap-xs">
        <Value>{lock.reference}</Value>
        <UnlockButton lock={lock} onUnlock={onUnlock} />
      </div>
      <Text variant="small" className="flex gap-xs">
        <span>{formatQuantity(lock.quantity)}</span>
        <span>{lockedAt(lock)}</span>
      </Text>
      <div className="flex items-center justify-between gap-xs">
        <Value>{lock.locked_by || 'System'}</Value>
        <Text variant="small">{formatStamp(lock.created_at)}</Text>
      </div>
    </li>
  )
}

export function LockRows({
  locks,
  showMetal,
  mobile,
  page,
  pageCount,
  onPageChange,
  onUnlock,
}: LockRowsProps) {
  const grid = showMetal
    ? 'grid grid-cols-[repeat(7,minmax(0,1fr))_2.5rem] gap-md'
    : 'grid grid-cols-[repeat(6,minmax(0,1fr))_2.5rem] gap-md'

  if (locks === undefined) {
    return (
      <div aria-busy className="flex flex-col gap-md py-sm">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} />
        ))}
      </div>
    )
  }

  if (locks.length === 0) {
    return (
      <EmptyState
        icon={<Package />}
        title="No locks this week"
        description="Locks show here when an order locks its price."
      />
    )
  }

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col divide-y divide-border">
        {!mobile && (
          <li aria-hidden className={cn(grid, 'items-center py-xs-plus')}>
            {HEADINGS.filter((heading) => showMetal || heading !== 'METAL').map((heading) => (
              <Text key={heading} variant="micro">
                {heading}
              </Text>
            ))}
          </li>
        )}
        {locks.map((lock) =>
          mobile ? (
            <MobileRow key={lock.id} lock={lock} onUnlock={onUnlock} />
          ) : (
            <DesktopRow
              key={lock.id}
              lock={lock}
              showMetal={showMetal}
              onUnlock={onUnlock}
              grid={grid}
            />
          )
        )}
      </ul>
      {pageCount >= 1 && (
        <div className="flex justify-center pt-sm">
          <Pagination page={page} pageCount={pageCount} onPageChange={onPageChange} />
        </div>
      )}
    </div>
  )
}
