'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { X as XIcon } from '@phosphor-icons/react'

import {
  ColumnDef,
  ColumnFiltersState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  PaginationState,
  flexRender,
  useReactTable,
} from '@tanstack/react-table'

import { AdminProduct } from '@/types/admin'
import { useAdminProducts } from '@/lib/queries/admin/useAdminProducts'
import { useDrawerStore } from '@/store/drawerStore'
import ProductDrawer from './productDrawer'
import { formatFullDate } from '@/utils/dateFormatting'

const formatPremium = (mult?: number | null) => {
  if (mult == null) return '-'
  const pct = Math.abs(mult - 1) * 100
  const dir = mult >= 1 ? 'over' : 'under'
  return `${pct.toFixed(2)}% ${dir}`
}

export default function ProductsTableSimple({ selectedMetal }: { selectedMetal?: string }) {
  const { data: products = [] } = useAdminProducts()
  const { openDrawer } = useDrawerStore()

  const [activeProduct, setActiveProduct] = useState<string | null>(null)
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const filteredProducts = useMemo(() => {
    if (!selectedMetal) return products
    return products.filter((p) => p.metal === selectedMetal)
  }, [products, selectedMetal])

  const columns: ColumnDef<AdminProduct>[] = [
    {
      id: 'name',
      header: () => <span className="flex justify-start text-sm text-neutral-600">Name</span>,
      accessorKey: 'product_name',
      filterFn: 'includesString',
      cell: ({ row }) => (
        <div className="flex justify-start text-xs sm:text-sm text-neutral-900">
          {row.original.product_name}
        </div>
      ),
    },
    {
      id: 'metal',
      header: () => (
        <span className="hidden sm:flex justify-center text-sm text-neutral-600">Metal</span>
      ),
      accessorKey: 'metal',
      cell: ({ row }) => (
        <div className="hidden sm:flex justify-center text-xs sm:text-sm text-neutral-900">
          {row.original.metal ?? '-'}
        </div>
      ),
    },
    {
      id: 'active',
      header: () => (
        <span className="hidden sm:flex justify-center text-sm text-neutral-600">Active</span>
      ),
      cell: ({ row }) => {
        const active = !!(row.original.display || row.original.sell_display)
        return (
          <div className="flex justify-center">
            <div
              className={[
                'px-2 py-0.5 border rounded-lg text-xs font-semibold inline-flex items-center justify-center',
                active
                  ? 'bg-success/20 text-success border-success'
                  : 'bg-destructive/20 text-destructive border-destructive',
              ].join(' ')}
            >
              {active ? 'Active' : 'Inactive'}
            </div>
          </div>
        )
      },
    },
    {
      id: 'bid',
      header: () => <span className="flex justify-center text-sm text-neutral-600">Bid</span>,
      cell: ({ row }) => (
        <div className="flex justify-center text-xs sm:text-sm text-neutral-900">
          {formatPremium(row.original.bid_premium)}
        </div>
      ),
    },
    {
      id: 'ask',
      header: () => <span className="flex justify-center text-sm text-neutral-600">Ask</span>,
      cell: ({ row }) => (
        <div className="flex justify-center text-xs sm:text-sm text-neutral-900">
          {formatPremium(row.original.ask_premium)}
        </div>
      ),
    },
  ]

  const table = useReactTable({
    data: filteredProducts,
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
        key={row.id}
        className="border-none items-center hover:bg-background hover:cursor-pointer"
        onClick={() => {
          setActiveProduct(row.original.id)
          openDrawer('product')
        }}
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id} className="align-middle px-2 py-2">
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
    )
  })

  return (
    <div className="space-y-4 w-full">
      <div className="flex">
        <div className="w-full">
          <DebouncedInput
            type="text"
            placeholder="Search by product name..."
            value={String(table.getColumn('name')?.getFilterValue() ?? '')}
            onChange={(value) => table.getColumn('name')?.setFilterValue(value)}
          />
        </div>
      </div>

      <div className="w-full bg-card rounded-lg p-2 raised-off-page">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="border-none items-center bg-card hover:bg-card">
                {hg.headers.map((header) => (
                  <TableHead key={header.id} className="align-middle h-10 text-xs text-neutral-600">
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

      {activeProduct && <ProductDrawer product_id={activeProduct} products={products} />}
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
