'use client'

import { useState } from 'react'
import {
  Accordion,
  Badge,
  EmptyState,
  EntityHeader,
  Skeleton,
  useMediaUp,
} from '@dorado/components'
import { TriangleAlert } from '@dorado/icons'
import type { SpotAdjustmentRead, SpotCandleRange, SpotLock } from '@dorado/contracts'

import { useNow } from '@/shared/hooks/useNow'

import { AdjustmentRows, ConfirmDialog, LockRows } from '../../../_components'
import { formatAgo, formatMoney } from '../../../_lib'
import {
  useActivity,
  useAdjustments,
  useCancelAdjustment,
  useHistory,
  useLiveBoard,
  useLocks,
  useMetal,
  useRemoveAdjustment,
  useSetAdjustment,
  useSetMetalSource,
  useSources,
  useUnlockSpotLock,
} from '../../_api'
import { spotBadge } from '../../_lib'
import { ActivitySection } from './ActivitySection'
import { AdjustmentSection } from './AdjustmentSection'
import { HistoryChart } from './HistoryChart'
import { SourceSection } from './SourceSection'
import { SpotSection } from './SpotSection'

type Pending =
  { kind: 'unlock'; lock: SpotLock } | { kind: 'remove'; adjustment: SpotAdjustmentRead } | null

export function MetalScreen({ metalId }: { metalId: string }) {
  useLiveBoard()
  const mobile = !useMediaUp('lg')
  const now = useNow()
  const [range, setRange] = useState<SpotCandleRange>('1Y')
  const [page, setPage] = useState(1)
  const [pending, setPending] = useState<Pending>(null)

  const metalQuery = useMetal(metalId)
  const metal = metalQuery.data
  const sources = useSources().data ?? []
  const history = useHistory(metalId, range)
  const locks = useLocks({ metal: metalId, status: null, q: null, page }).data
  const adjustments = (useAdjustments().data ?? []).filter((entry) => entry.metal_id === metalId)
  const activity = useActivity(metalId).data ?? []

  const setSource = useSetMetalSource(metalId)
  const setAdjustment = useSetAdjustment(metalId, metal?.source_id ?? '')
  const cancel = useCancelAdjustment(metalId)
  const remove = useRemoveAdjustment()
  const unlock = useUnlockSpotLock()

  if (metalQuery.isError) {
    return (
      <EmptyState
        icon={<TriangleAlert />}
        title={`No metal named ${metalId}`}
        description="The API has no spot for this metal."
      />
    )
  }

  if (!metal) {
    return (
      <div className="flex flex-col gap-md lg:gap-lg">
        <Skeleton shape="block" />
        <Skeleton shape="block" className="h-100" />
      </div>
    )
  }

  const badge = spotBadge(metal)
  const lockPages = locks ? Math.max(1, Math.ceil(locks.total / locks.page_size)) : 1
  const activeCount = adjustments.filter((entry) => entry.scope === 'Active').length
  const adjustmentError =
    (setAdjustment.error?.message ?? cancel.error?.message ?? setSource.error?.message) || null

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
  }

  return (
    <>
      <EntityHeader
        layout={mobile ? 'mobile' : 'desktop'}
        eyebrow="SPOT METAL"
        badge={badge ? <Badge intent={badge.intent}>{badge.label}</Badge> : undefined}
        title={metal.metal_id}
        reference={`Source ${metal.source_id ?? 'none'}  ·  last tick ${formatAgo(metal.last_tick_at, now)}`}
      />
      <div className="flex flex-col gap-md lg:flex-row lg:items-start lg:gap-lg">
        <div className="contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:gap-lg">
          <HistoryChart
            metalId={metal.metal_id}
            range={range}
            labels={history.labels}
            closes={history.closes}
            onRangeChange={setRange}
            className="order-1 lg:order-none"
          />
          <Accordion label="Order Locks" defaultOpen flush className="order-5 lg:order-none">
            <div className="px-md pb-sm">
              <LockRows
                locks={locks?.items}
                showMetal={false}
                mobile={mobile}
                page={page}
                pageCount={lockPages}
                onPageChange={setPage}
                onUnlock={(lock) => setPending({ kind: 'unlock', lock })}
              />
            </div>
          </Accordion>
          <Accordion
            label="Adjustments"
            trailing={`${activeCount} active`}
            defaultOpen
            flush
            className="order-6 lg:order-none"
          >
            <div className="px-md pb-sm">
              <AdjustmentRows
                adjustments={adjustments}
                mobile={mobile}
                onRemove={(adjustment) => setPending({ kind: 'remove', adjustment })}
              />
            </div>
          </Accordion>
          <ActivitySection activity={activity} className="order-7 lg:order-none" />
        </div>
        <div className="contents lg:flex lg:w-112 lg:shrink-0 lg:flex-col lg:gap-lg">
          <SpotSection metal={metal} className="order-2 lg:order-none" />
          <SourceSection
            metal={metal}
            sources={sources}
            now={now}
            onPick={(sourceId) => setSource.mutate({ source_id: sourceId })}
            className="order-3 lg:order-none"
          />
          <AdjustmentSection
            key={`${metal.adjustment?.updated_at ?? 'none'}:${metal.source_id ?? ''}`}
            metal={metal}
            pending={setAdjustment.isPending || cancel.isPending}
            error={adjustmentError}
            onSave={(patch) => setAdjustment.mutate(patch)}
            onClear={() => cancel.mutate()}
            className="order-4 lg:order-none"
          />
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
    </>
  )
}
