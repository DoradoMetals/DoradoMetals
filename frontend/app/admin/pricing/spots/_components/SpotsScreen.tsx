'use client'

import { useState } from 'react'
import { Button, Input, Select, Text, useDebounce, useMediaUp } from '@dorado/components'
import { Search } from '@dorado/icons'
import type {
  SpotAdjustmentRead,
  SpotLock,
  SpotLockStatus,
  SpotSourceRead,
  SpotTicker,
} from '@dorado/contracts'

import { useNow } from '@/shared/hooks/useNow'
import { protectedRoutes } from '@/shared/types/routes'

import {
  AdjustmentRows,
  ConfirmDialog,
  FeedNotice,
  LockRows,
  Panel,
  PricingHeader,
} from '../../_components'
import { adjustmentAmount, formatAgo, formatClock, formatMoney, formatSince } from '../../_lib'
import {
  useAdjustments,
  useBoard,
  useFreezeAll,
  useLiveBoard,
  useLocks,
  useRefreshSpots,
  useRemoveAdjustment,
  useSources,
  useUnlockSpotLock,
  useUpdateSpotSource,
} from '../_api'
import { GlobalDefaultPanel } from './GlobalDefaultPanel'
import { SourcesPanel } from './SourcesPanel'
import { SpotCardItem } from './SpotCardItem'

const ADJUSTMENTS_PER_PAGE = 4

const STATUS_ITEMS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'released', label: 'Released' },
]

type Pending =
  | { kind: 'unlock'; lock: SpotLock }
  | { kind: 'remove'; adjustment: SpotAdjustmentRead }
  | { kind: 'off'; source: SpotSourceRead }
  | null

const newest = (spots: SpotTicker[]): string | null =>
  spots.reduce<string | null>(
    (latest, spot) =>
      spot.last_tick_at && (!latest || spot.last_tick_at > latest) ? spot.last_tick_at : latest,
    null
  )

const unique = (values: string[]) => [...new Set(values)]

function cardFooter(spot: SpotTicker, freeze: SpotAdjustmentRead | undefined, now: number) {
  if (spot.state === 'frozen') {
    const by = freeze?.updated_by || freeze?.created_by
    return `Frozen at ${formatClock(freeze?.updated_at)}${by ? ` by ${by}` : ''}`
  }
  if (spot.state === 'stale') return `No tick for ${formatSince(spot.last_tick_at, now)}`
  return `Updated ${formatAgo(spot.last_tick_at, now)}`
}

export function SpotsScreen() {
  useLiveBoard()
  const mobile = !useMediaUp('lg')
  const now = useNow()

  const [status, setStatus] = useState('all')
  const [metal, setMetal] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [adjustmentPage, setAdjustmentPage] = useState(1)
  const [pending, setPending] = useState<Pending>(null)
  const q = useDebounce(search, 300)

  const board = useBoard().data
  const adjustments = useAdjustments().data ?? []
  const sources = useSources().data ?? []
  const locks = useLocks({
    metal: metal === 'all' ? null : metal,
    status: status === 'all' ? null : (status as SpotLockStatus),
    q: q.trim() === '' ? null : q.trim(),
    page,
  }).data

  const freezeAll = useFreezeAll()
  const refresh = useRefreshSpots()
  const unlock = useUnlockSpotLock()
  const remove = useRemoveAdjustment()
  const updateSource = useUpdateSpotSource()

  const spots = board?.spots ?? []
  const lastTick = newest(spots)
  const active = adjustments.filter((entry) => entry.scope === 'Active' && entry.mode === 'adjust')
  const adjustmentPages = Math.max(1, Math.ceil(adjustments.length / ADJUSTMENTS_PER_PAGE))
  const shownAdjustments = adjustments.slice(
    (adjustmentPage - 1) * ADJUSTMENTS_PER_PAGE,
    adjustmentPage * ADJUSTMENTS_PER_PAGE
  )
  const lockPages = locks ? Math.max(1, Math.ceil(locks.total / locks.page_size)) : 1

  const reset = () => {
    setStatus('all')
    setMetal('all')
    setSearch('')
    setPage(1)
  }

  const reorder = async (ids: string[]) => {
    for (const [index, id] of ids.entries()) {
      const source = sources.find((entry) => entry.id === id)
      if (source && source.sort_order !== index + 1) {
        await updateSource.mutateAsync({ id, patch: { sort_order: index + 1 } })
      }
    }
  }

  const toggle = (source: SpotSourceRead, enabled: boolean) => {
    if (!enabled && source.metal_ids.length > 0) {
      setPending({ kind: 'off', source })
      return
    }
    updateSource.mutate({ id: source.id, patch: { enabled } })
  }

  const confirm = () => {
    if (!pending) return
    const done = { onSettled: () => setPending(null) }
    if (pending.kind === 'unlock') unlock.mutate(pending.lock.id, done)
    if (pending.kind === 'remove') {
      remove.mutate(
        { metalId: pending.adjustment.metal_id, sourceId: pending.adjustment.source_id },
        done
      )
    }
    if (pending.kind === 'off') {
      updateSource.mutate({ id: pending.source.id, patch: { enabled: false } }, done)
    }
  }

  const searchField = (
    <Input
      aria-label="Search locks"
      placeholder="Search order, metal or admin"
      leading={<Search />}
      value={search}
      onChange={(event) => {
        setSearch(event.target.value)
        setPage(1)
      }}
      className={mobile ? undefined : 'w-70'}
    />
  )

  const offMetals = pending?.kind === 'off' ? pending.source.metal_ids.join(', ') : ''

  return (
    <>
      <PricingHeader
        section="spots"
        mobile={mobile}
        description={`Live from the feed · last tick ${formatAgo(lastTick, now)}`}
        selects={
          mobile ? undefined : (
            <>
              <Select
                label="Lock status"
                items={STATUS_ITEMS}
                value={status}
                onValueChange={(value) => {
                  setStatus(value)
                  setPage(1)
                }}
                className="w-70"
              />
              <Select
                label="Metal"
                items={[
                  { value: 'all', label: 'All metals' },
                  ...spots.map((spot) => ({ value: spot.id, label: spot.id })),
                ]}
                value={metal}
                onValueChange={(value) => {
                  setMetal(value)
                  setPage(1)
                }}
                className="w-45"
              />
            </>
          )
        }
        reset={
          mobile ? undefined : (
            <>
              <Button variant="tertiary" size="sm" onClick={reset}>
                Reset
              </Button>
              <Text variant="micro">{`${locks?.total ?? 0} locks · ${adjustments.length} adjustments`}</Text>
            </>
          )
        }
      />

      {board && board.paused.length > 0 && (
        <FeedNotice
          intent="danger"
          mobile={mobile}
          title="Spot feed stale"
          message="Orders still price from the last good tick."
          actions={
            <>
              <Button
                variant="secondary"
                size="sm"
                disabled={freezeAll.isPending}
                onClick={() => freezeAll.mutate({ reason: 'Spot feed stale' })}
              >
                Freeze all
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={refresh.isPending}
                onClick={() => refresh.mutate()}
              >
                Retry now
              </Button>
            </>
          }
        />
      )}

      <div className="grid grid-cols-1 gap-md lg:grid-cols-4">
        {spots.map((spot) => (
          <SpotCardItem
            key={spot.id}
            spot={spot}
            href={`${protectedRoutes.adminPricingSpots.path}/${encodeURIComponent(spot.id)}`}
            footer={cardFooter(
              spot,
              adjustments.find((entry) => entry.metal_id === spot.id && entry.mode === 'freeze'),
              now
            )}
          />
        ))}
      </div>

      <Panel title="Order Locks" trailing={mobile ? undefined : searchField}>
        {mobile && <div className="pb-xs pt-2xs">{searchField}</div>}
        <LockRows
          locks={locks?.items}
          showMetal
          mobile={mobile}
          page={page}
          pageCount={lockPages}
          onPageChange={setPage}
          onUnlock={(lock) => setPending({ kind: 'unlock', lock })}
        />
      </Panel>

      {active.length > 0 && (
        <FeedNotice
          intent="warning"
          mobile={mobile}
          title={`Adjustments active · ${unique(active.map((entry) => entry.metal_id)).join(', ')}`}
          message={`${active
            .map((entry) => `${entry.metal_id} ${adjustmentAmount(entry)}`)
            .join(' and ')} on ${unique(active.map((entry) => entry.source_id)).join(
            ', '
          )}, set by ${unique(
            active.map((entry) => entry.updated_by || entry.created_by || 'System')
          ).join(', ')}.`}
          actions={
            <Button variant="secondary" size="sm" asChild>
              <a href="#adjustments">Review</a>
            </Button>
          }
        />
      )}

      <div className="grid grid-cols-1 items-start gap-md lg:grid-cols-2 lg:gap-lg">
        <Panel id="adjustments" title="Adjustments">
          <AdjustmentRows
            adjustments={shownAdjustments}
            mobile={mobile}
            page={adjustmentPage}
            pageCount={adjustmentPages}
            onPageChange={setAdjustmentPage}
            onRemove={(adjustment) => setPending({ kind: 'remove', adjustment })}
          />
        </Panel>
        <div className="grid grid-cols-1 items-start gap-md lg:grid-cols-2 lg:gap-lg">
          <GlobalDefaultPanel
            sources={sources}
            mobile={mobile}
            onMakeDefault={(source) =>
              updateSource.mutate({ id: source.id, patch: { is_default: true } })
            }
          />
          <SourcesPanel sources={sources} now={now} onToggle={toggle} onReorder={reorder} />
        </div>
      </div>

      <ConfirmDialog
        open={pending?.kind === 'unlock'}
        title={pending?.kind === 'unlock' ? `Unlock ${pending.lock.reference}?` : ''}
        body={
          pending?.kind === 'unlock'
            ? `The locked ${pending.lock.metal_id.toLowerCase()} price of ${formatMoney(
                pending.lock.bid ?? pending.lock.ask
              )} is released and the order prices at the live spot again.`
            : ''
        }
        confirmLabel="Unlock"
        pending={unlock.isPending}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending?.kind === 'remove'}
        title={
          pending?.kind === 'remove' ? `Remove the ${pending.adjustment.metal_id} adjustment?` : ''
        }
        body={
          pending?.kind === 'remove'
            ? `${pending.adjustment.metal_id} goes back to the raw ${pending.adjustment.source_id} price straight away.`
            : ''
        }
        confirmLabel="Remove"
        pending={remove.isPending}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending?.kind === 'off'}
        title={pending?.kind === 'off' ? `Turn off ${pending.source.id}?` : ''}
        body={
          pending?.kind === 'off'
            ? `${pending.source.id} is the active source for ${offMetals}. Turning it off leaves ${offMetals} pricing from its last good tick, marked Stale, until another source is on.`
            : ''
        }
        confirmLabel="Turn off"
        pending={updateSource.isPending}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
    </>
  )
}
