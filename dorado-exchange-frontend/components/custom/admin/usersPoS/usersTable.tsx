import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  PaginationState,
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
  getFilteredRowModel,
  ColumnFiltersState,
} from '@tanstack/react-table'

import { AdminUser } from '@/types/admin'
import { ChevronLeft, ChevronRight, Settings, X } from 'lucide-react'
import getPrimaryIconStroke from '@/utils/getPrimaryIconStroke'
import { cn } from '@/lib/utils'
import { PlusIcon } from '@phosphor-icons/react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { useAdminUsers } from '@/lib/queries/admin/useAdminUser'
import { userRoleOptions } from '@/types/user'
import { useDrawerStore } from '@/store/drawerStore'
import AdminUsersDrawer from './usersDrawer'
import PriceNumberFlow from '../../products/PriceNumberFlow'
import { CreateSalesOrderDrawer } from '../salesOrdersPoS/createSalesOrder/createSalesOrderDrawer'

export default function UsersTable({ setOpen }: { setOpen: (open: boolean) => void }) {
  const { data: users = [] } = useAdminUsers()

  const { openDrawer } = useDrawerStore()
  const [activeUser, setActiveUser] = useState<string | null>(null)

  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 8 })
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const columns: ColumnDef<AdminUser>[] = [
    {
      id: 'name',
      header: function Header({ column }) {
        return (
          <div className="text-left">
            <span className="text-xs text-neutral-600">Name</span>
          </div>
        )
      },
      accessorKey: 'name',
      enableColumnFilter: true,
      enableHiding: false,
      filterFn: 'includesString',
      cell: ({ row }) => {
        const role =
          userRoleOptions.find((role) => role.value === row.original.role) ?? userRoleOptions[1]
        const Icon = role.icon
        return (
          <Button
            variant="ghost"
            className={`flex items-center h-6 p-0 gap-2`}
            onClick={() => {
              setActiveUser(row.original.id)
              openDrawer('users')
            }}
          >
            <Icon size={20} className={cn(role.colorClass)} />
            <p className={cn(role.colorClass)}>{row.original.name}</p>
          </Button>
        )
      },
    },
    {
      id: 'email',
      header: function Header({ column }) {
        return (
          <div className="text-left hidden sm:flex">
            <span className="text-xs text-neutral-600">Email</span>
          </div>
        )
      },
      accessorKey: 'email',
      cell: ({ row }) => (
        <div className="w-32 hidden sm:flex sm:w-full overflow-hidden text-ellipsis whitespace-nowrap text-left text-xs sm:text-sm text-neutral-900">
          {row.original.email}
        </div>
      ),
    },
    {
      id: 'created_at',
      header: function Header({ column }) {
        return (
          <div className="flex items-center justify-start gap-1 h-full hidden sm:flex">
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
        return (
          <div className="text-left text-xs sm:text-sm text-neutral-900 hidden sm:flex">
            {formatted}
          </div>
        )
      },
    },

    {
      id: 'dorado_funds',
      header: function Header({ column }) {
        return (
          <div className="hidden sm:flex justify-end">
            <span className="text-xs text-neutral-600">Dorado Credit</span>
          </div>
        )
      },
      accessorKey: 'dorado_funds',
      cell: ({ row }) => (
        <div className="flex justify-end hidden sm:flex">
          <PriceNumberFlow value={row.original.dorado_funds} />
        </div>
      ),
    },
  ]

  const table = useReactTable({
    data: users,
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
  })

  const MemoizedRow = React.memo(function MemoizedRow({
    row,
    isLast,
  }: {
    row: ReturnType<typeof table.getRowModel>['rows'][0]
    isLast: boolean
  }) {
    return (
      <>
        <TableRow className="border-none items-center hover:bg-transparent" key={row.id}>
          {row.getVisibleCells().map((cell) => (
            <TableCell
              key={cell.id}
              className={cn('align-middle text-left px-2 py-2 text-xs sm:text-sm text-neutral-900')}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </TableCell>
          ))}
        </TableRow>
        {!isLast && <TableRow className="separator-inset border-none" />}
      </>
    )
  })

  return (
    <div className="space-y-4 w-full">
      <div className="flex flex-col">
        <Button
          variant="ghost"
          className="flex items-center gap-1 text-primary-gradient p-0 mr-auto"
          size="sm"
          onClick={() => {
            setOpen(true)
          }}
        >
          <PlusIcon size={16} color={getPrimaryIconStroke()} />
          Create New User
        </Button>

        <div className="gap-2 flex flex-col sm:flex-row sm:items-start sm:justify-between w-full gap-5">
          <div className="flex w-full gap-2">
            <div className="w-full">
              <DebouncedInput
                type="text"
                placeholder="Search by user name..."
                value={String(table.getColumn('name')?.getFilterValue() ?? '')}
                onChange={(value) => table.getColumn('name')?.setFilterValue(value)}
              />
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="raised-off-page bg-card text-neutral-800 hover:bg-card"
                >
                  <Settings size={16} className="text-neutral-800" />
                  <div className="hidden sm:block ml-1">Columns</div>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-40 p-2 space-y-2 bg-background"
                align="end"
                side="bottom"
              >
                {table
                  .getAllLeafColumns()

                  .map((column) => (
                    <div key={column.id} className="flex items-center gap-2 w-full">
                      <Checkbox
                        id={`col-${column.id}`}
                        checked={column.getIsVisible()}
                        onCheckedChange={() => column.toggleVisibility()}
                        className="checkbox-form"
                      />
                      <label
                        htmlFor={`col-${column.id}`}
                        className="text-sm cursor-pointer text-left"
                      >
                        {typeof column.columnDef.header === 'function'
                          ? column.id
                          : column.columnDef.header}
                      </label>
                    </div>
                  ))}
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      <div className="w-full bg-card rounded-lg p-2 raised-off-page">
        <Table>
          <TableHeader className="border-none">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="border-none items-center bg-card hover:bg-card"
              >
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="align-middle h-10 text-xs text-neutral-600">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
            <TableRow className="separator-inset border-none" />
          </TableHeader>

          <TableBody>
            {table.getRowModel().rows.map((row, i, allRows) => (
              <MemoizedRow key={row.id} row={row} isLast={i === allRows.length - 1} />
            ))}
          </TableBody>
        </Table>
      </div>

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
      {activeUser && <AdminUsersDrawer user_id={activeUser ?? ''} users={users ?? []} />}
      {activeUser && <CreateSalesOrderDrawer />}
    </div>
  )
}

function DebouncedInput({
  value: initialValue,
  onChange,
  debounce = 300,
  ...props
}: {
  value: string | number
  onChange: (value: string | number) => void
  debounce?: number
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'>) {
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  useEffect(() => {
    const timeout = setTimeout(() => {
      onChange(value)
    }, debounce)
    return () => clearTimeout(timeout)
  }, [value, debounce])

  const handleClear = () => {
    setValue('')
    onChange('')
  }

  return (
    <div className="relative w-full h-10">
      <Input
        {...props}
        className="input-floating-label-form h-10"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {value !== '' && (
        <Button
          variant="ghost"
          onClick={handleClear}
          className="absolute right-1 top-1/2 -translate-y-1/2 text-neutral-600 hover:bg-transparent"
          tabIndex={-1}
        >
          <X size={16} />
        </Button>
      )}
    </div>
  )
}
