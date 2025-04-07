import { Input } from '@/components/ui/input'
import { useAdminScrap } from '@/lib/queries/admin/useAdminScrap'
import { AdminScrap } from '@/types/admin'
import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  PaginationState,
  useReactTable,
} from '@tanstack/react-table'
import React, { useRef, useState } from 'react'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { TableFilterSelect } from '../../../table/filterSelect'
import { useFormatPurchaseOrderNumber } from '@/utils/formatPurchaseOrderNumber'
import { TableSearchSelect } from '@/components/table/filterSelectSearch'
import { UserDetailsDialog } from '../usersPoS/usersModal'

const statusColorMap: Record<string, string> = {
  Pending: 'bg-yellow-600 text-white',
  Received: 'bg-pink-600 text-white',
  Confirmed: 'bg-orange-600 text-white',
  Paid: 'bg-blue-600 text-white',
  Completed: 'bg-green-600 text-white',
}

export default function ScrapTable() {
  const { data: scrap = [] } = useAdminScrap()

  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 8 })
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const columns: ColumnDef<AdminScrap>[] = [
    {
      id: 'metal',
      header: function OrderStatusHeader({ column }) {
        const anchorRef = useRef<HTMLDivElement>(null)

        const uniqueMetals = React.useMemo(() => {
          const values = column.getFacetedUniqueValues?.()
          return values ? Array.from(values.keys()).sort() : []
        }, [column])

        return (
          <div ref={anchorRef} className="flex items-center justify-center gap-1 h-full">
            <span className="text-xs text-neutral-600">Metal</span>
            <TableFilterSelect column={column} options={uniqueMetals} anchorRef={anchorRef} />
          </div>
        )
      },
      accessorKey: 'metal',
      enableColumnFilter: true,
      enableHiding: false,
      filterFn: 'includesString',
      cell: ({ row }) => (
        <div className="flex justify-center">
          <p>{row.original.metal}</p>
        </div>
      ),
    },
    {
      id: 'order_number',
      header: function UsernameHeader({ column }) {
        const anchorRef = useRef<HTMLDivElement>(null)

        const uniqueOrderNumbers = React.useMemo(() => {
          const values = column.getFacetedUniqueValues?.()
          return values ? Array.from(values.keys()).sort() : []
        }, [column])

        return (
          <div ref={anchorRef} className="flex items-center justify-center gap-1 h-full">
            <span className="text-xs text-neutral-600">Order Number</span>
            <TableSearchSelect
              column={column}
              options={uniqueOrderNumbers}
              anchorRef={anchorRef}
              placeholder="Search users…"
            />
          </div>
        )
      },
      accessorKey: 'order_number',
      enableColumnFilter: true,
      enableHiding: false,
      filterFn: 'includesString',
      cell: ({ row }) => {
        const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()
        return (
          <div className="flex justify-center">
            <p className="w-40">{formatPurchaseOrderNumber(row.original.order_number)}</p>
          </div>
        )
      },
    },
    {
      id: 'order_status',
      header: function OrderStatusHeader({ column }) {
        const anchorRef = useRef<HTMLDivElement>(null)
        const uniqueStatuses = React.useMemo(() => {
          const values = column.getFacetedUniqueValues?.()
          return values ? Array.from(values.keys()).sort() : []
        }, [column])

        return (
          <div ref={anchorRef} className="flex items-center justify-center gap-1 h-full">
            <span className="text-xs text-neutral-600">Order Status</span>
            <TableFilterSelect column={column} options={uniqueStatuses} anchorRef={anchorRef} />
          </div>
        )
      },
      accessorKey: 'order_status',
      enableColumnFilter: true,
      enableHiding: false,
      filterFn: 'includesString',
      cell: ({ row }) => {
        const status = row.original.order_status
        const colorClass = statusColorMap[status] ?? 'bg-gray-300 text-black'
        return (
          <div className="flex justify-center">
            <Badge className={`${colorClass} w-24 text-sm justify-center`}>{status}</Badge>
          </div>
        )
      },
    },
    {
      id: 'username',
      header: function UsernameHeader({ column }) {
        const anchorRef = useRef<HTMLDivElement>(null)

        const uniqueUsernames = React.useMemo(() => {
          const values = column.getFacetedUniqueValues?.()
          return values ? Array.from(values.keys()).sort() : []
        }, [column])

        return (
          <div ref={anchorRef} className="flex items-center justify-center gap-1 h-full">
            <span className="text-xs text-neutral-600">User</span>
            <TableSearchSelect
              column={column}
              options={uniqueUsernames}
              anchorRef={anchorRef}
              placeholder="Search users…"
            />
          </div>
        )
      },
      accessorKey: 'username',
      enableColumnFilter: true,
      enableHiding: false,
      filterFn: 'includesString',
      cell: ({ row }) => {
        const [userDialogOpen, setUserDialogOpen] = useState(false)

        return (
          <div className="flex justify-center">
            <UserDetailsDialog
              open={userDialogOpen}
              setOpen={setUserDialogOpen}
              user_id={row.original.user_id}
              username={row.original.username}
            />
          </div>
        )
      },
    },
    {
      id: 'content',
      header: 'Content',
      accessorKey: 'content',
      cell: ({ row }) => (
        <Input
          type="number"
          pattern="[0-9]*"
          className="input-floating-label-form no-spinner text-right w-20"
          defaultValue={row.original.content}
          // onBlur={(e) => handleUpdate(row.original.scrap_id, { content: Number(e.target.value) })}
        />
      ),
    },
    {
      id: 'gross',
      header: 'Gross',
      accessorKey: 'gross',
      cell: ({ row }) => (
        <Input
          type="number"
          pattern="[0-9]*"
          className="input-floating-label-form no-spinner text-right w-20"
          defaultValue={row.original.gross}
          // onBlur={(e) => handleUpdate(row.original.scrap_id, { gross: Number(e.target.value) })}
        />
      ),
    },
    {
      id: 'gross_unit',
      header: 'Unit',
      accessorKey: 'gross_unit',
      cell: ({ row }) => (
        <Input
          type="text"
          className="input-floating-label-form no-spinner text-right w-20"
          defaultValue={row.original.gross_unit}
          // onBlur={(e) => handleUpdate(row.original.scrap_id, { gross: e.target.value })}
        />
      ),
    },
    {
      id: 'purity',
      header: 'Purity',
      accessorKey: 'purity',
      cell: ({ row }) => (
        <Input
          type="number"
          pattern="[0-9]*"
          className="input-floating-label-form no-spinner text-right w-20"
          defaultValue={row.original.purity}
          // onBlur={(e) => handleUpdate(row.original.id, { purity: Number(e.target.value) })}
        />
      ),
    },
  ]

  const table = useReactTable({
    data: scrap,
    columns: columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      pagination,
      columnFilters,
    },
    onPaginationChange: setPagination,
    onColumnFiltersChange: setColumnFilters,
    autoResetPageIndex: false,
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  const MemoizedRow = React.memo(function MemoizedRow({
    row,
  }: {
    row: ReturnType<typeof table.getRowModel>['rows'][0]
  }) {
    return (
      <TableRow className="border-none items-center hover:bg-background" key={row.id}>
        {row.getVisibleCells().map((cell) => (
          <TableCell className="align-middle text-center px-2 py-2" key={cell.id}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
    )
  })

  return (
    <div className="space-y-2 w-full">
      <Table className="w-full">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow
              key={headerGroup.id}
              className="border-none items-center bg-card hover:bg-card"
            >
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className="align-middle h-10 text-xs text-neutral-600 text-center"
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <MemoizedRow key={row.id} row={row} />
          ))}
        </TableBody>
      </Table>

      <div className="flex justify-center items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
          className="h-8 w-8 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <span className="text-sm text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </span>

        <Button
          variant="ghost"
          size="icon"
          disabled={!table.getCanNextPage()}
          onClick={() => table.nextPage()}
          className="h-8 w-8 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
