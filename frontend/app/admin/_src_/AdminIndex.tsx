'use client'

import * as React from 'react'
import NextLink from 'next/link'
import { useOrders, useRefiningOrders } from '@dorado/client'
import type { OrderListItem, RefiningOrderView } from '@dorado/contracts'
import {
  DataTable,
  EmptyState,
  Link as UILink,
  Skeleton,
  Text,
  type DataTableColumn,
} from '@dorado/components'
import { Inbox, TriangleAlert } from '@dorado/icons'

import { DASH, when } from './orders/format'

// THE ADMIN INDEX. Two lists and nothing else: every customer order, and every
// refiner order, each row a way into the screen that already exists.
//
// NOTHING HERE IS COMPUTED. A cell is a field of the row the API answered with,
// spelled by `format.ts` where it is a timestamp. `GET /api/orders` answers
// `OrderListItem[]` - the row plus `reference` (the same "PO-2481"/"SO-2481"
// expression the single view builds) and `customer` (id, name, email), so
// neither is composed here (ruling 83).
//
// The refiner list has no such gap: `GET /api/refining/orders` answers the same
// `RefiningOrderView` the screen reads, refiner and state included.

const ordersColumns: DataTableColumn<OrderListItem>[] = [
  {
    accessorKey: 'number',
    header: 'Order',
    meta: { primary: true },
    cell: ({ row }) => (
      <UILink asChild>
        <NextLink href={`/admin/orders/${row.original.id}`}>{row.original.number}</NextLink>
      </UILink>
    ),
  },
  {
    accessorKey: 'reference',
    header: 'Reference',
    cell: ({ row }) => row.original.reference,
  },
  {
    id: 'customer',
    header: 'Customer',
    cell: ({ row }) => row.original.customer?.name ?? DASH,
  },
  {
    accessorKey: 'direction',
    header: 'Direction',
    cell: ({ row }) => row.original.direction ?? DASH,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => row.original.status ?? DASH,
  },
  {
    accessorKey: 'created_at',
    header: 'Placed',
    enableSorting: true,
    cell: ({ row }) => when(row.original.created_at),
  },
]

const refiningColumns: DataTableColumn<RefiningOrderView>[] = [
  {
    accessorKey: 'number',
    header: 'Order',
    meta: { primary: true },
    cell: ({ row }) => (
      <UILink asChild>
        <NextLink href={`/admin/refining/${row.original.id}`}>{row.original.number}</NextLink>
      </UILink>
    ),
  },
  {
    id: 'refiner',
    header: 'Refiner',
    cell: ({ row }) => row.original.refiner?.organization?.name ?? DASH,
  },
  {
    accessorKey: 'direction',
    header: 'Direction',
    cell: ({ row }) => row.original.direction ?? DASH,
  },
  {
    accessorKey: 'state',
    header: 'State',
    cell: ({ row }) => row.original.state ?? DASH,
  },
  {
    accessorKey: 'created_at',
    header: 'Created',
    enableSorting: true,
    cell: ({ row }) => when(row.original.created_at),
  },
]

function TableSection({
  title,
  pending,
  error,
  children,
}: {
  title: string
  pending: boolean
  error: boolean
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-sm" aria-labelledby={`${title}-heading`}>
      <Text variant="h5" as="h2" id={`${title}-heading`}>
        {title}
      </Text>
      {pending ? (
        <div className="flex flex-col gap-2xs" data-testid={`${title}-loading`}>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : error ? (
        <EmptyState
          icon={<TriangleAlert />}
          title={`${title} did not load`}
          description="The API refused the list."
        />
      ) : (
        children
      )}
    </section>
  )
}

export function AdminIndex() {
  const orders = useOrders()
  const refining = useRefiningOrders()

  return (
    <div className="flex flex-col gap-xl p-md lg:p-xl">
      <Text variant="h4" as="h1">
        Admin
      </Text>

      <TableSection title="Orders" pending={orders.isPending} error={orders.isError}>
        <DataTable
          label="Orders"
          columns={ordersColumns}
          data={orders.data ?? []}
          getRowId={(row) => row.id}
          searchable
          searchPlaceholder="Search orders"
          pageSize={25}
          empty={<EmptyState icon={<Inbox />} title="No orders yet" />}
        />
      </TableSection>

      <TableSection title="Refiner orders" pending={refining.isPending} error={refining.isError}>
        <DataTable
          label="Refiner orders"
          columns={refiningColumns}
          data={refining.data ?? []}
          getRowId={(row) => row.id}
          searchable
          searchPlaceholder="Search refiner orders"
          pageSize={25}
          empty={<EmptyState icon={<Inbox />} title="No refiner orders yet" />}
        />
      </TableSection>
    </div>
  )
}
