'use client'

import { formatStamp } from '@/shared/utils/formatStamp'
import { Badge, Button, EmptyState } from '@dorado/components'
import { useUserNames } from '@dorado/client'
import { LockOpen } from '@dorado/icons'
import type { SpotLock, UserName as UserNameRow } from '@dorado/contracts'

import { RecordTable, recordColumns, type RecordColumn } from '@/shared/ui/RecordTable'
import { UserName } from '@/shared/ui/UserName'

import { formatMoney } from '../../_lib'
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

const column = recordColumns<SpotLock>()

function lockColumns(
  names: readonly UserNameRow[] | undefined,
  showMetal: boolean,
  onUnlock: (lock: SpotLock) => void
): RecordColumn<SpotLock>[] {
  return column.columns([
    column.accessor('reference', { header: 'ORDER', meta: { primary: true, line: 1 } }),
    column.accessor('metal_id', {
      header: 'METAL',
      enableSorting: true,
      meta: { primary: true, line: 0, title: true, hidden: !showMetal },
    }),
    column.accessor('quantity', {
      header: 'QUANTITY',
      cell: ({ row }) => formatQuantity(row.original.quantity),
      meta: { primary: true, line: 2 },
    }),
    column.display({
      id: 'locked_at',
      header: 'LOCKED AT',
      cell: ({ row }) => formatMoney(row.original.bid ?? row.original.ask),
      meta: { primary: true, line: 2 },
    }),
    column.accessor('locked_by_id', {
      header: 'LOCKED BY',
      cell: ({ row }) => <UserName id={row.original.locked_by_id} names={names} />,
      meta: { primary: true, line: 3 },
    }),
    column.accessor('created_at', {
      header: 'WHEN',
      enableSorting: true,
      cell: ({ row }) => formatStamp(row.original.created_at),
      meta: { primary: true, line: 3, end: true },
    }),
    column.accessor('status', {
      header: 'STATUS',
      cell: ({ row }) =>
        row.original.status === 'active' ? (
          <Badge intent="info">Active</Badge>
        ) : row.original.status === 'settled' ? (
          <Badge intent="success">Settled</Badge>
        ) : (
          <Badge intent="neutral">Released</Badge>
        ),
      meta: { line: 0, end: true },
    }),
    column.display({
      id: 'unlock',
      header: '',
      cell: ({ row }) =>
        row.original.status === 'active' ? (
          <Button variant="tertiary" size="sm" onClick={() => onUnlock(row.original)}>
            Unlock
          </Button>
        ) : null,
      meta: { numeric: true, line: 1, end: true },
    }),
  ])
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
  const names = useUserNames(locks?.map((lock) => lock.locked_by_id) ?? []).data
  return (
    <RecordTable
      columns={lockColumns(names, showMetal || mobile, onUnlock)}
      data={locks}
      label="Order locks"
      layout={mobile ? 'cards' : 'table'}
      getRowId={(lock) => lock.id}
      page={page}
      pageCount={pageCount}
      onPageChange={onPageChange}
      empty={
        <EmptyState
          icon={<LockOpen />}
          title="No order locks"
          description="A lock shows here when an order locks its price."
        />
      }
    />
  )
}
