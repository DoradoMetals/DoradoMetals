'use client'

import { Badge, Button, EmptyState, Text } from '@dorado/components'
import { SlidersHorizontal } from '@dorado/icons'
import type { SpotAdjustmentRead, SpotSourceRead } from '@dorado/contracts'

import { ActorName } from '@/shared/ui/ActorName'
import { RecordTable, recordColumns, type RecordColumn } from '@/shared/ui/RecordTable'

import { adjustmentAmount, adjustmentExpiry, adjustmentWindow, sourceName } from '../_lib'

export type AdjustmentRowsProps = {
  adjustments: SpotAdjustmentRead[]
  sources: SpotSourceRead[]
  pageSize?: number
  onRemove: (adjustment: SpotAdjustmentRead) => void
}

const column = recordColumns<SpotAdjustmentRead>()

function adjustmentColumns(
  sources: SpotSourceRead[],
  onRemove: (adjustment: SpotAdjustmentRead) => void
): RecordColumn<SpotAdjustmentRead>[] {
  return column.columns([
    column.accessor('metal_id', { header: 'Metal', meta: { line: 0, title: true } }),
    column.display({
      id: 'amount',
      header: 'Amount',
      cell: ({ row }) => (
        <Text variant="small-medium" emphasis="default">
          {adjustmentAmount(row.original)}
        </Text>
      ),
      meta: { line: 0 },
    }),
    column.display({
      id: 'remove',
      header: '',
      cell: ({ row }) =>
        row.original.expired ? null : (
          <Button variant="tertiary" size="sm" onClick={() => onRemove(row.original)}>
            Remove
          </Button>
        ),
      meta: { line: 0, end: true },
    }),
    column.accessor('expired', {
      header: 'Status',
      cell: ({ row }) =>
        row.original.expired ? (
          <Badge intent="neutral">Expired</Badge>
        ) : (
          <Badge intent="success">Active</Badge>
        ),
      meta: { line: 0, end: true },
    }),
    column.accessor('source_id', {
      header: 'Source',
      cell: ({ row }) => <Text variant="micro">{sourceName(sources, row.original.source_id)}</Text>,
      meta: { line: 1 },
    }),
    column.accessor('updated_by', {
      header: 'Set by',
      cell: ({ row }) => (
        <Text variant="small-medium" emphasis="default">
          <ActorName name={row.original.updated_by || row.original.created_by} />
        </Text>
      ),
      meta: { line: 2 },
    }),
    column.display({
      id: 'expiry',
      header: 'Expiry',
      cell: ({ row }) => (
        <Text variant="micro">
          {row.original.expired ? adjustmentWindow(row.original) : adjustmentExpiry(row.original)}
        </Text>
      ),
      meta: { line: 2, end: true },
    }),
  ])
}

export function AdjustmentRows({ adjustments, sources, pageSize, onRemove }: AdjustmentRowsProps) {
  return (
    <RecordTable
      columns={adjustmentColumns(sources, onRemove)}
      data={adjustments}
      label="Adjustments"
      layout="cards"
      getRowId={(row) => `${row.metal_id}:${row.source_id}`}
      pageSize={pageSize}
      empty={
        <EmptyState
          icon={<SlidersHorizontal />}
          title="No adjustments"
          description="Set one from a metal page when a feed needs correcting."
        />
      }
    />
  )
}
