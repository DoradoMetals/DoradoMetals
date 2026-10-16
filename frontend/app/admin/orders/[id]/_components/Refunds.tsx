'use client'

import * as React from 'react'
import type { RefundView, UserName as UserNameRow } from '@dorado/contracts'

import { formatStamp } from '@/shared/utils/formatStamp'
import { RecordTable, recordColumns, type RecordColumn } from '@/shared/ui/RecordTable'
import { userNameOf } from '@/shared/ui/UserName'
import { formatTotal } from '../../_lib'
import { OrderSection, type SectionContent } from './OrderSection'

export type RefundsProps = {
  refunds: readonly RefundView[]
  names: readonly UserNameRow[] | undefined
  layout?: 'desktop' | 'mobile'
  content?: SectionContent
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onRetry?: () => void
}

export const refundMethod = (
  row: Pick<RefundView, 'rail' | 'card_brand' | 'card_last4'>
): string => {
  const card = [row.card_brand, row.card_last4 ? `•••• ${row.card_last4}` : null]
    .filter(Boolean)
    .join(' ')
  if (row.rail === 'CARD' || card) return card ? `Card · ${card}` : 'Card'
  return row.rail ?? '—'
}

const column = recordColumns<RefundView>()

function refundColumns(names: readonly UserNameRow[] | undefined): RecordColumn<RefundView>[] {
  return column.columns([
    column.accessor('created_at', {
      header: 'When',
      cell: ({ row }) => formatStamp(row.original.created_at),
      meta: { primary: true, fill: true, line: 2, cardLabel: 'When' },
    }),
    column.accessor('amount', {
      header: 'Amount',
      cell: ({ row }) => formatTotal(row.original.amount),
      meta: { primary: true, numeric: true, line: 0, title: true },
    }),
    column.display({
      id: 'method',
      header: 'Method',
      cell: ({ row }) => (
        <span className="text-muted-foreground">{refundMethod(row.original)}</span>
      ),
      meta: { line: 3, cardLabel: 'Method' },
    }),
    column.accessor('created_by_id', {
      header: 'Who',
      cell: ({ row }) => userNameOf(names, row.original.created_by_id),
      meta: { primary: true, line: 1, cardLabel: 'Who' },
    }),
  ])
}

export function Refunds({
  refunds,
  names,
  layout = 'desktop',
  content = 'loaded',
  open,
  onOpenChange,
  onRetry,
}: RefundsProps) {
  const data = React.useMemo(() => [...refunds], [refunds])
  const shown: SectionContent = content === 'loaded' && data.length === 0 ? 'empty' : content

  return (
    <OrderSection
      title="Refunds"
      layout={layout}
      content={shown}
      open={open}
      onOpenChange={onOpenChange}
      onRetry={onRetry}
      emptyTitle="No refunds"
      emptyDescription="Refunds on this order show here."
    >
      <RecordTable
        columns={refundColumns(names)}
        data={data}
        label="Refunds"
        layout={layout === 'mobile' ? 'cards' : 'table'}
        getRowId={(row) => row.id}
        empty={null}
      />
    </OrderSection>
  )
}
