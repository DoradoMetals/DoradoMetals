'use client'

import * as React from 'react'
import { Badge, Button, Text, cn } from '@dorado/components'

import type { PurityDispute as PurityDisputeRow } from '@dorado/contracts'

import { formatStamp } from '@/shared/utils/formatStamp'

import { ORDER_ACTIONS, formatRatio, offers, type OrderAction } from '../_lib'
import { OrderSection } from './OrderSection'

export type PurityDisputeProps = {
  dispute: PurityDisputeRow
  lotReference: string
  actions: readonly OrderAction[]
  layout?: 'desktop' | 'mobile'
  pending?: boolean
  onReassay?: () => void
  onResolve?: () => void
  defaultOpen?: boolean
}

const figure = (
  purity: number | null,
  source: string | null | undefined,
  at: string | null | undefined
) => {
  const context = [source, at ? formatStamp(at) : null].filter(Boolean).join(', ')
  return context ? `${formatRatio(purity)} (${context})` : formatRatio(purity)
}

export function PurityDispute({
  dispute,
  lotReference,
  actions,
  layout = 'desktop',
  pending = false,
  onReassay,
  onResolve,
  defaultOpen = true,
}: PurityDisputeProps) {
  const mobile = layout === 'mobile'
  const resolved = dispute.resolved_at != null
  const canReassay = offers(actions, ORDER_ACTIONS.reassay) && onReassay != null
  const canResolve = offers(actions, ORDER_ACTIONS.resolveDispute) && onResolve != null
  const reference = lotReference.replace(/^Lot /, '')

  const facts: [string, string | null | undefined][] = [
    ['Our assay', figure(dispute.our_purity, null, null)],
    ['Customer claims', figure(dispute.claimed_purity, dispute.claim_source, dispute.created_at)],
    ['Reason', dispute.reason],
    ['Resolution', resolved ? dispute.resolution : null],
  ]

  return (
    <OrderSection
      title={`Purity dispute · ${reference}`}
      layout={layout}
      defaultOpen={defaultOpen}
      badge={
        resolved ? (
          <Badge intent="success" variant="soft">
            Resolved
          </Badge>
        ) : (
          <Badge intent="warning" variant="soft">
            Disputed
          </Badge>
        )
      }
    >
      <dl data-state={resolved ? 'resolved' : 'open'} className="flex flex-col gap-md">
        {facts
          .filter(([, value]) => value != null && value !== '')
          .map(([label, value]) => (
            <div
              key={label}
              className={cn('flex gap-3xs', mobile ? 'flex-col' : 'items-center justify-between')}
            >
              <Text as="dt" variant="small" className="text-muted-foreground">
                {label}
              </Text>
              <Text as="dd" variant="small" className={cn(!mobile && 'text-right')}>
                {value}
              </Text>
            </div>
          ))}
      </dl>
      {!resolved && (
        <div className={cn('flex gap-sm', mobile ? 'flex-col [&>button]:w-full' : 'flex-row')}>
          <Button variant="secondary" disabled={!canReassay || pending} onClick={onReassay}>
            Re-assay
          </Button>
          <Button disabled={!canResolve || pending} onClick={onResolve}>
            Resolve
          </Button>
        </div>
      )}
    </OrderSection>
  )
}
