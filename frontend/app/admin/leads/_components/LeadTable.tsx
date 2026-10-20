'use client'

import NextLink from 'next/link'
import * as React from 'react'
import {
  Badge,
  DataTable,
  Text,
  type DataTableActionsContext,
  type DataTableColumn,
} from '@dorado/components'
import type { LeadEstimateTotal, LeadSort, LeadSortDirection, LeadView } from '@dorado/contracts'

import { protectedRoutes } from '@/shared/types/routes'

import { BADGE_INTENT, DASH, formatEstimate, formatMoney, formatRelative, leadBadge } from '../_lib'

export type LeadTableSort = { key: LeadSort; direction: LeadSortDirection }

export type LeadTableProps = {
  layout?: 'desktop' | 'mobile'
  rows: LeadView[]
  total: number
  pageSize: number
  totals: readonly LeadEstimateTotal[]
  sourceName: (id: string | null) => string
  ownerName: (id: string | null) => string
  sort: LeadTableSort
  onSortChange: (sort: LeadTableSort) => void
  actions: (context: DataTableActionsContext<LeadView>) => React.ReactNode
  loading: boolean
  error?: React.ReactNode
  empty: React.ReactNode
  page: number
  pageCount: number
  onPageChange: (page: number) => void
}

function StatusBadge({ lead }: { lead: LeadView }) {
  const badge = leadBadge(lead)
  return (
    <Badge variant="soft" intent={BADGE_INTENT[badge]}>
      {badge}
    </Badge>
  )
}

const href = (id: string) => `${protectedRoutes.adminLeads.path}/${id}`

export function LeadTable({
  layout = 'desktop',
  rows,
  total,
  pageSize,
  totals,
  sourceName,
  ownerName,
  sort,
  onSortChange,
  actions,
  loading,
  error,
  empty,
  page,
  pageCount,
  onPageChange,
}: LeadTableProps) {
  const names = React.useRef({ sourceName, ownerName, totals })
  names.current = { sourceName, ownerName, totals }
  const valueOf = React.useCallback(
    (id: string) => names.current.totals.find((row) => row.lead_id === id)?.total,
    []
  )

  const sorting = React.useMemo(
    () => [{ id: sort.key, desc: sort.direction === 'desc' }],
    [sort.key, sort.direction]
  )

  const columns = React.useMemo<DataTableColumn<LeadView>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Name',
        enableSorting: true,
        meta: { primary: true, fill: true },
        cell: ({ row }) => (
          <NextLink href={href(row.original.id)} className="rounded-sm hover:underline focus-ring">
            {row.original.name}
          </NextLink>
        ),
      },
      {
        id: 'source',
        header: 'Source',
        cell: ({ row }) => names.current.sourceName(row.original.source_id),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge lead={row.original} />,
      },
      {
        id: 'assigned_to',
        header: 'Assigned to',
        cell: ({ row }) => names.current.ownerName(row.original.assigned_to_id),
      },
      {
        id: 'estimated_value',
        header: 'Estimated value',
        enableSorting: true,
        accessorFn: (row) => valueOf(row.id) ?? -1,
        meta: { numeric: true, primary: true },
        cell: ({ row }) => {
          const amount = valueOf(row.original.id)
          return amount === undefined ? DASH : formatMoney(amount)
        },
      },
      {
        id: 'created',
        accessorKey: 'created_at',
        header: 'Created',
        enableSorting: true,
        cell: ({ row }) => formatRelative(row.original.created_at),
      },
    ],
    [valueOf]
  )

  return (
    <DataTable
      label="All leads"
      title="All leads"
      layout={layout}
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      selectable
      actions={actions}
      sorting={sorting}
      onSortingChange={(next) => {
        const head = next[0]
        if (head) onSortChange({ key: head.id as LeadSort, direction: head.desc ? 'desc' : 'asc' })
      }}
      loading={loading}
      error={error}
      empty={empty}
      page={page}
      pageCount={pageCount}
      pageSize={pageSize}
      total={total}
      onPageChange={onPageChange}
      mobileRow={(lead) => {
        const amount = valueOf(lead.id)
        return (
          <div className="flex flex-col gap-3xs px-md py-sm">
            <div className="flex items-center justify-between gap-xs">
              <NextLink
                href={href(lead.id)}
                className="truncate text-small font-medium text-foreground focus-ring"
              >
                {lead.name}
              </NextLink>
              <StatusBadge lead={lead} />
            </div>
            <p className="flex flex-wrap items-center gap-2xs text-micro text-muted-foreground">
              <span>{sourceName(lead.source_id)}</span>
              <span aria-hidden>·</span>
              <span>{ownerName(lead.assigned_to_id)}</span>
              <span aria-hidden>·</span>
              <span>{formatRelative(lead.created_at)}</span>
            </p>
            <Text variant="small-medium">
              {amount === undefined ? DASH : formatEstimate(amount)}
            </Text>
          </div>
        )
      }}
    />
  )
}
