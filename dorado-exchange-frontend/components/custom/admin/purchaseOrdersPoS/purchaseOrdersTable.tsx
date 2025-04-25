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
import React, { Fragment, useRef, useState } from 'react'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Notebook } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { TableFilterSelect } from '../../../table/filterSelect'
import { useFormatPurchaseOrderNumber } from '@/utils/formatPurchaseOrderNumber'
import { TableSearchSelect } from '@/components/table/filterSelectSearch'
import { UserDetailsDialog } from '../usersPoS/usersModal'
import { useAdminPurchaseOrders } from '@/lib/queries/admin/useAdminPurchaseOrders'
import { AdminPurchaseOrder, statusConfig } from '@/types/admin'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import PurchaseOrderDrawer from './adminPurchaseOrderDrawer/adminPurchaseOrderDrawer'

const statusColorMap: Record<string, string> = {
  Transit: 'bg-fuchsia-200 text-fuchsia-700',
  Unsettled: 'bg-rose-200 text-rose-700',
  Filled: 'bg-yellow-200 text-yellow-700',
  Confirmed: 'bg-cyan-200 text-cyan-700',
  Settled: 'bg-orange-200 text-orange-700',
  Completed: 'bg-emerald-200 text-emerald-700',
}

export default function PurchaseOrdersTable() {
  const { data: purchaseOrders = [] } = useAdminPurchaseOrders()

  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 8 })
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [activeOrder, setActiveOrder] = useState<AdminPurchaseOrder | null>(null)
  const [activeUser, setActiveUser] = useState<string | null>(null)
  const [isOrderActive, setIsOrderActive] = useState(false)

  const columns: ColumnDef<AdminPurchaseOrder>[] = [
    {
      id: 'order_number',
      header: function Header({ column }) {
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
        const config = statusConfig[row.original.order_status]
        if (!config) return <Fragment key={row.original.order_status} />

        return (
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="icon"
              className={`flex items-center justify-center bg-transparent hover:bg-transparent ${config.text_color}`}
              onClick={() => {
                setIsOrderActive(true)
                setActiveOrder(row.original)
                setActiveUser(row.original.user_id)
              }}
            >
              <p>{formatPurchaseOrderNumber(row.original.order_number)}</p>
            </Button>
          </div>
        )
      },
    },

    {
      id: 'username',
      header: function Header({ column }) {
        const anchorRef = useRef<HTMLDivElement>(null)

        const uniqueUsernames = React.useMemo(() => {
          const values = column.getFacetedUniqueValues?.()
          return values ? Array.from(values.keys()).sort() : []
        }, [column])

        return (
          <div ref={anchorRef} className="flex items-center justify-center sm:justify-end gap-1 h-full">
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
        const config = statusConfig[row.original.order_status]
        if (!config) return <Fragment key={row.original.order_status} />

        return (
          <div className="flex justify-center sm:justify-end">
            <UserDetailsDialog
              open={userDialogOpen}
              setOpen={setUserDialogOpen}
              user_id={row.original.user_id}
              username={row.original.username}
              color={config.text_color}
            />
          </div>
        )
      },
    },

    {
      id: 'created_at',
      header: function Header({ column }) {
        return (
          <div className="flex items-center justify-center gap-1 h-full">
            <span className="text-xs text-neutral-600">Created On</span>
          </div>
        )
      },
      accessorKey: 'created_at',
      cell: ({ row }) => {
        const date = new Date(row.original.created_at)

        const formatted = `${date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}`
        return <div className="flex justify-center">{formatted}</div>
      },
    },
    {
      id: 'order_status',
      header: function Header({ column }) {
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
        const config = statusConfig[row.original.order_status]
        if (!config) return <Fragment key={row.original.order_status} />
        const Icon = config.icon
        return (
          <div className="flex justify-center">
            <Icon size={20} className={config.text_color} />
          </div>
        )
      },
    },
    {
      id: 'updated_at',
      header: function Header({ column }) {
        return (
          <div className="hidden sm:flex items-center justify-center gap-1 h-full">
            <span className="text-xs text-neutral-600">Updated On</span>
          </div>
        )
      },
      accessorKey: 'updated_at',
      cell: ({ row }) => {
        const date = new Date(row.original.updated_at)

        const formatted = `${date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}`
        return <div className="hidden sm:flex justify-center">{formatted}</div>
      },
    },
    {
      id: 'notes',
      header: function Header({ column }) {
        return (
          <div className="hidden sm:flex items-center justify-center gap-1 h-full">
            <span className="text-xs text-neutral-600">Notes</span>
          </div>
        )
      },
      accessorKey: 'notes',
      cell: ({ row }) => {
        const [open, setOpen] = React.useState(false)
        const [value, setValue] = React.useState(row.original.notes)
        const config = statusConfig[row.original.order_status]
        if (!config) return <Fragment key={row.original.order_status} />

        return (
          <div className='hidden sm:flex'>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild className="">
                <Button variant="ghost" size="sm" className="hover:bg-background px-0">
                  <Notebook size={20} className={`${config.text_color}`} />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Order Notes</DialogTitle>
                </DialogHeader>
                <Textarea
                  className="input-floating-label-form"
                  value={value ?? ''}
                  disabled={true}
                />
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )
      },
    },
  ]

  const table = useReactTable({
    data: purchaseOrders,
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
      {activeOrder && (
        <PurchaseOrderDrawer
          order={activeOrder}
          user_id={activeUser ?? ''}
          isOrderActive={isOrderActive}
          setIsOrderActive={setIsOrderActive}
        />
      )}
    </div>
  )
}
