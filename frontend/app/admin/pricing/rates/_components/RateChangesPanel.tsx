'use client'

import { Badge, EmptyState, Input } from '@dorado/components'
import { History, Search } from '@dorado/icons'
import type { RateChangeRow } from '@dorado/contracts'

import { ActorName } from '@/shared/ui/ActorName'
import { Panel } from '@/shared/ui/Panel'
import { RecordTable, recordColumns, type RecordColumn } from '@/shared/ui/RecordTable'
import { formatStamp } from '@/shared/utils/formatStamp'

import { capitalize } from '../../_lib'
import { bandCell, unitShort } from '../_lib'

export type RateChangesPanelProps = {
  rows: RateChangeRow[] | undefined
  mobile: boolean
  search: string
  page: number
  pageCount: number
  onSearch: (value: string) => void
  onPageChange: (page: number) => void
}

const column = recordColumns<RateChangeRow>()

const changeColumns: RecordColumn<RateChangeRow>[] = column.columns([
  column.accessor('metal_id', {
    header: 'METAL',
    enableSorting: true,
    cell: ({ row }) => row.original.metal_id ?? '—',
    meta: { primary: true, line: 0, title: true },
  }),
  column.accessor('type', {
    header: 'TYPE',
    cell: ({ row }) => capitalize(row.original.type),
    meta: {
      primary: true,
      line: 0,
      end: true,
      cardCell: (original) => (
        <Badge intent="neutral">{capitalize((original as RateChangeRow).type)}</Badge>
      ),
    },
  }),
  column.display({
    id: 'old_range',
    header: 'OLD RANGE',
    cell: ({ row }) => bandCell(row.original.old_band, row.original.type, unitShort),
    meta: { primary: true, line: 1, cardLabel: 'Old range' },
  }),
  column.display({
    id: 'new_range',
    header: 'NEW RANGE',
    cell: ({ row }) => bandCell(row.original.new_band, row.original.type, unitShort),
    meta: { primary: true, line: 2, cardLabel: 'New range' },
  }),
  column.accessor('actor_name', {
    header: 'SET BY',
    cell: ({ row }) => <ActorName name={row.original.actor_name} />,
    meta: { primary: true, line: 3 },
  }),
  column.accessor('changed_at', {
    header: 'WHEN',
    enableSorting: true,
    cell: ({ row }) => formatStamp(row.original.changed_at),
    meta: { primary: true, line: 3, end: true },
  }),
])

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

  return (
    <Panel title="Rate Changes" trailing={mobile ? undefined : field}>
      {mobile && <div className="pb-xs pt-2xs">{field}</div>}
      <RecordTable
        columns={changeColumns}
        data={rows}
        label="Rate changes"
        layout={mobile ? 'cards' : 'table'}
        evenColumns
        getRowId={(row) => `${row.id}:${row.type}`}
        page={page}
        pageCount={pageCount}
        onPageChange={onPageChange}
        empty={
          <EmptyState
            icon={<History />}
            title="No rate changes"
            description="A change shows here when someone saves a metal's rates."
          />
        }
      />
    </Panel>
  )
}
