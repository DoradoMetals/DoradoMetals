import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import React, { useEffect, useMemo, useState } from 'react'
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
import { ChevronLeft, ChevronRight, Settings, Trash2, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import getPrimaryIconStroke from '@/utils/getPrimaryIconStroke'
import { PlusIcon, CheckCircle, XCircle, CheckIcon, XIcon } from '@phosphor-icons/react' // <-- icons for booleans

import { Lead, LeadCard } from '@/types/leads'
import { useLeads, useDeleteLead } from '@/lib/queries/useLeads'
import formatPhoneNumber from '@/utils/formatPhoneNumber'
import { useDrawerStore } from '@/store/drawerStore'
import LeadsDrawer from './leadsDrawer'

export default function LeadsTable({
  setOpen,
  selectedCard,
}: {
  setOpen: (open: boolean) => void
  selectedCard: LeadCard
}) {
  const { data: leads = [] } = useLeads()
  const deleteLead = useDeleteLead()

  const { openDrawer } = useDrawerStore()
  const [activeLead, setActiveLead] = useState<string | null>(null)

  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const filteredLeads = useMemo<Lead[]>(() => {
    switch (selectedCard) {
      case 'Converted':
        return leads.filter((l) => !!l.converted)
      case 'Responded':
        return leads.filter((l) => !!l.responded)
      case 'Contacted':
        return leads.filter((l) => !!l.contacted)
      default:
        return leads
    }
  }, [leads, selectedCard])

  const BoolIcon = ({ value }: { value: boolean }) =>
    value ? (
      <CheckIcon size={20} className="text-success" />
    ) : (
      <XIcon size={20} className="text-destructive" weight="fill" />
    )

  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }))
  }, [selectedCard])

  const columns: ColumnDef<Lead>[] = [
    {
      id: 'name',
      header: () => <span className="text-sm text-neutral-600">Name</span>,
      accessorKey: 'name',
      enableHiding: false,
      filterFn: 'includesString',
      cell: ({ row }) => (
        <div className="text-xs sm:text-sm text-neutral-900">{row.original.name}</div>
      ),
    },
    {
      id: 'phone',
      header: () => <span className="flex justify-center text-sm text-neutral-600">Phone</span>,
      accessorKey: 'phone',
      cell: ({ row }) => (
        <div className="flex justify-center text-xs sm:text-sm text-neutral-900">
          {formatPhoneNumber(row.original.phone)}
        </div>
      ),
    },
    {
      id: 'email',
      header: () => <span className="flex justify-center text-sm text-neutral-600">Email</span>,
      accessorKey: 'email',
      cell: ({ row }) => (
        <div className="flex justify-center text-xs sm:text-sm text-neutral-900">
          {row.original.email}
        </div>
      ),
    },
    {
      id: 'contacted',
      header: () => <span className="flex justify-center text-sm text-neutral-600">Contacted</span>,
      accessorKey: 'contacted',
      cell: ({ row }) => (
        <div className="flex justify-center">
          <BoolIcon value={row.original.contacted} />
        </div>
      ),
    },
    {
      id: 'responded',
      header: () => <span className="flex justify-center text-sm text-neutral-600">Responded</span>,
      accessorKey: 'responded',
      cell: ({ row }) => (
        <div className="flex justify-center">
          <BoolIcon value={row.original.responded} />
        </div>
      ),
    },
    {
      id: 'converted',
      header: () => <span className="flex justify-center text-sm text-neutral-600">Converted</span>,
      accessorKey: 'converted',
      cell: ({ row }) => (
        <div className="flex justify-center">
          <BoolIcon value={row.original.converted} />
        </div>
      ),
    },
    {
      id: 'delete',
      header: () => <span className="flex justify-end text-sm text-neutral-600">Deleted</span>,
      cell: ({ row }) => {
        const [open, setOpen] = React.useState(false)
        const lead = row.original

        const handleConfirmDelete = () => {
          deleteLead.mutate(lead)
          setOpen(false)
        }

        return (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive hover:bg-background"
                >
                  <Trash2 size={18} />
                </Button>
              </div>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Lead?</DialogTitle>
              </DialogHeader>
              <div className="text-sm text-neutral-700">
                This will permanently delete{' '}
                <strong>{lead.name || lead.email || lead.phone}</strong>.
              </div>
              <DialogFooter className="pt-4">
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleConfirmDelete}>
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )
      },
    },
  ]

  const table = useReactTable({
    data: filteredLeads,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination, columnFilters },
    onPaginationChange: setPagination,
    onColumnFiltersChange: setColumnFilters,
    autoResetPageIndex: false,
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
  })

  const MemoizedRow = React.memo(function MemoizedRow({
    row,
  }: {
    row: ReturnType<typeof table.getRowModel>['rows'][0]
  }) {
    return (
      <TableRow
        className="border-none items-center hover:bg-background hover:cursor-pointer"
        key={row.id}
        onClick={() => {
          setActiveLead(row.original.id)
          openDrawer('leads')
        }}
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id} className={`align-middle px-2 py-2`}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
    )
  })

  return (
    <div className="space-y-4 w-full">
      <div className="flex flex-col">
        <Button
          variant="ghost"
          className="flex items-center gap-1 text-primary-gradient p-0 mr-auto"
          size="sm"
          onClick={() => setOpen(true)}
        >
          <PlusIcon size={16} color={getPrimaryIconStroke()} />
          Create New Lead
        </Button>

        <div className="gap-2 flex flex-col sm:flex-row sm:items-start sm:justify-between w-full gap-5">
          <div className="flex w-full gap-2">
            <div className="w-full">
              <DebouncedInput
                type="text"
                placeholder="Search by lead name..."
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
                {table.getAllLeafColumns().map((column) => (
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
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="border-none items-center bg-card hover:bg-card"
              >
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={`align-middle h-10 text-xs text-neutral-600`}
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
      {activeLead && <LeadsDrawer lead_id={activeLead ?? ''} leads={leads ?? []} />}
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
