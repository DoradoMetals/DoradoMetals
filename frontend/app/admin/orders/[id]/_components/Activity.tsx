'use client'

import * as React from 'react'
import { Text } from '@dorado/components'
import type { OrderActivity, OrderActivityKind, UserName as UserNameRow } from '@dorado/contracts'

import { formatStamp } from '@/shared/utils/formatStamp'
import { RecordTable, recordColumns, type RecordColumn } from '@/shared/ui/RecordTable'
import { userNameOf } from '@/shared/ui/UserName'

import { OrderSection, type SectionContent } from './OrderSection'

export type ActivityProps = {
  activity: readonly OrderActivity[] | undefined
  names: readonly UserNameRow[] | undefined
  content?: Exclude<SectionContent, 'empty'>
  layout?: 'desktop' | 'mobile'
  onRetry?: () => void
  defaultOpen?: boolean
}

export const ACTIVITY_LABELS: Record<OrderActivityKind, string> = {
  order_created: 'Placed order',
  order_updated: 'Updated order',
  order_cancelled: 'Cancelled order',
  spots_locked: 'Locked spots',
  spots_unlocked: 'Unlocked spots',
  transfer_created: 'Created payment',
  transfer_sent: 'Sent payment',
  transfer_completed: 'Payment completed',
  transfer_event: 'Payment update',
  document_stored: 'Stored document',
  email_sent: 'Sent email',
  refiner_sent: 'Sent to refiner',
  refiner_settled: 'Refiner settled',
  arrived: 'Arrived',
}

const words = (value: string) => value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

export function activityDetail(row: OrderActivity): string {
  const detail = row.detail
  if (detail == null) return ''
  const parts = [
    detail.metal_id,
    detail.rail,
    detail.state && words(detail.state),
    detail.document_kind && words(detail.document_kind),
    detail.email_kind && words(detail.email_kind),
    detail.email_status && words(detail.email_status),
    detail.event_type && words(detail.event_type),
    detail.override_reason,
  ]
  return parts.filter((part) => part != null && part !== '').join(' · ')
}

type Row = OrderActivity & { key: string }

const column = recordColumns<Row>()

function activityColumns(names: readonly UserNameRow[] | undefined): RecordColumn<Row>[] {
  return column.columns([
    column.accessor('at', {
      header: 'When',
      cell: ({ row }) => formatStamp(row.original.at),
      meta: { primary: true, fill: true, line: 2, cardLabel: 'When' },
    }),
    column.accessor('actor_id', {
      header: 'Who',
      cell: ({ row }) => userNameOf(names, row.original.actor_id),
      meta: { primary: true, line: 1, cardLabel: 'Who' },
    }),
    column.display({
      id: 'what',
      header: 'What',
      cell: ({ row }) => ACTIVITY_LABELS[row.original.kind],
      meta: { primary: true, line: 0, title: true },
    }),
    column.display({
      id: 'detail',
      header: 'Detail',
      cell: ({ row }) => (
        <Text variant="small" className="truncate text-muted-foreground">
          {activityDetail(row.original)}
        </Text>
      ),
      meta: { numeric: true, line: 3, cardLabel: 'Detail' },
    }),
  ])
}

export function Activity({
  activity,
  names,
  content = 'loaded',
  layout = 'desktop',
  onRetry,
  defaultOpen = true,
}: ActivityProps) {
  const rows = React.useMemo<Row[]>(
    () =>
      (activity ?? []).map((row, index) => ({
        ...row,
        key: `${row.kind}-${row.subject_id}-${index}`,
      })),
    [activity]
  )
  const state: SectionContent = content === 'loaded' && rows.length === 0 ? 'empty' : content

  return (
    <OrderSection
      title="Activity"
      layout={layout}
      content={state}
      emptyTitle="No activity yet"
      emptyDescription="Who placed, locked, priced, paid and sent this order shows here."
      errorTitle="Couldn’t load activity"
      onRetry={onRetry}
      defaultOpen={defaultOpen}
    >
      <RecordTable
        columns={activityColumns(names)}
        data={rows}
        label="Activity"
        layout={layout === 'mobile' ? 'cards' : 'table'}
        getRowId={(row) => row.key}
        empty={null}
      />
    </OrderSection>
  )
}
