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
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

import {
  useAdminProducts,
  useCreateProduct,
  useDeleteProduct,
  useSaveProduct,
} from '@/lib/queries/admin/useAdminProducts'
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
import {
  useAdminMetals,
  useAdminMints,
  useAdminSuppliers,
  useAdminTypes,
} from '@/lib/queries/admin/useAdmin'
import { Switch } from '@/components/ui/switch'
import { AdminProduct } from '@/types/admin'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChevronLeft, ChevronRight, Edit, Trash2, X } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import getPrimaryIconStroke from '@/utils/getPrimaryIconStroke'
import { cn } from '@/lib/utils'
import { NotePencil, Plus } from '@phosphor-icons/react'

export default function ProductsTableEditable({ selectedMetal }: { selectedMetal: string }) {
  const { data: products = [] } = useAdminProducts()
  const { data: metals } = useAdminMetals()
  const { data: suppliers } = useAdminSuppliers()
  const { data: mints } = useAdminMints()
  const { data: types } = useAdminTypes()
  const saveProduct = useSaveProduct()
  const deleteProduct = useDeleteProduct()
  const createProduct = useCreateProduct()

  const filteredProducts = selectedMetal
    ? products.filter((p) => p.metal === selectedMetal)
    : products

  const [activeTab, setActiveTab] = useState<'general' | 'details' | 'display'>('general')
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 8 })
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const alwaysVisibleColumns = ['name']

  const generalColumns = ['bid', 'ask', 'quantity']

  const detailsColumns = [
    'description',
    'content',
    'gross',
    'purity',
    'metal',
    'mint',
    'supplier',
    'type',
    'delete',
  ]

  const displayColumns = [
    'display',
    'homepage_display',
    'filter_category',
    'shadow_offset',
    'variant_group',
  ]

  const getColumnVisibilityForTab = (tab: 'general' | 'details' | 'display') => {
    const visibleColumns = new Set([
      ...alwaysVisibleColumns,
      ...(tab === 'general' ? generalColumns : []),
      ...(tab === 'details' ? detailsColumns : []),
      ...(tab === 'display' ? displayColumns : []),
    ])

    const allColumns = [
      ...alwaysVisibleColumns,
      ...generalColumns,
      ...detailsColumns,
      ...displayColumns,
    ]

    const visibility: Record<string, boolean> = {}
    for (const col of allColumns) {
      visibility[col] = visibleColumns.has(col)
    }

    return visibility
  }

  const [columnVisibility, setColumnVisibility] = useState(getColumnVisibilityForTab('general'))

  const handleUpdate = (id: string, updatedFields: Partial<AdminProduct>) => {
    const product = table.getRowModel().rows.find((r) => r.original.id === id)?.original
    if (!product) return
    const updated = { ...product, ...updatedFields }
    saveProduct.mutate(updated)
  }

  const columns: ColumnDef<AdminProduct>[] = [
    {
      id: 'name',
      header: function Header({ column }) {
        return (
          <div className="flex items-center justify-center gap-1 h-full">
            <span className="text-xs text-neutral-600">Name</span>
          </div>
        )
      },
      accessorKey: 'product_name',
      enableColumnFilter: true,
      enableHiding: false,
      filterFn: 'includesString',
      cell: ({ row }) => (
        <Input
          type="text"
          className="input-floating-label-form min-w-40 sm:min-w-70"
          defaultValue={row.original.product_name}
          onBlur={(e) => handleUpdate(row.original.id, { product_name: e.target.value })}
        />
      ),
    },
    {
      id: 'description',
      header: 'Desc.',
      accessorKey: 'product_description',
      cell: ({ row }) => {
        const [open, setOpen] = React.useState(false)
        const [value, setValue] = React.useState(row.original.product_description)

        const handleSave = () => {
          handleUpdate(row.original.id, { product_description: value })
          setOpen(false)
        }

        return (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild className="w-5">
              <Button variant="ghost" size="sm" className="hover:bg-background px-0">
                <NotePencil size={20} color={getPrimaryIconStroke()} />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Product Description</DialogTitle>
              </DialogHeader>
              <Textarea
                className="input-floating-label-form"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  className="raised-off-page liquid-gold shine-on-hover text-white hover:text-white"
                >
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )
      },
    },
    {
      id: 'metal',
      header: 'Metal',
      accessorKey: 'metal',
      cell: ({ row }) => (
        <Select
          defaultValue={row.original.metal}
          onValueChange={(value) => handleUpdate(row.original.id, { metal: value })}
        >
          <SelectTrigger className="bg-card raised-off-page border-none h-9 w-30">
            <SelectValue placeholder="Metal" />
          </SelectTrigger>
          <SelectContent>
            {metals?.map((metal, index) => (
              <SelectItem key={index} value={metal.type}>
                {metal.type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      id: 'supplier',
      header: 'Supplier',
      accessorKey: 'supplier',
      cell: ({ row }) => (
        <Select
          defaultValue={row.original.supplier}
          onValueChange={(value) => handleUpdate(row.original.id, { supplier: value })}
        >
          <SelectTrigger className="bg-card raised-off-page border-none h-9 w-30">
            <SelectValue placeholder="Supplier" />
          </SelectTrigger>
          <SelectContent className="bg-card">
            {suppliers?.map((supplier, index) => (
              <SelectItem key={index} value={supplier.name}>
                {supplier.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      id: 'mint',
      header: 'Mint',
      accessorKey: 'mint',
      cell: ({ row }) => (
        <Select
          defaultValue={row.original.mint}
          onValueChange={(value) => handleUpdate(row.original.id, { mint: value })}
        >
          <SelectTrigger className="bg-card raised-off-page border-none h-9 w-46">
            <SelectValue placeholder="Mint" />
          </SelectTrigger>
          <SelectContent>
            {mints?.map((mint, index) => (
              <SelectItem key={index} value={mint.name}>
                {mint.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      accessorKey: 'product_type',
      cell: ({ row }) => (
        <Select
          defaultValue={row.original.product_type}
          onValueChange={(value) => handleUpdate(row.original.id, { product_type: value })}
        >
          <SelectTrigger className="bg-card raised-off-page border-none h-9 w-30">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            {types?.map((type, index) => (
              <SelectItem key={index} value={type.name}>
                {type.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      id: 'content',
      header: 'Content',
      accessorKey: 'content',
      cell: ({ row }) => (
        <Input
          type="number"
          pattern="[0-9]*"
          className="input-floating-label-form no-spinner text-right min-w-20"
          defaultValue={row.original.content}
          onBlur={(e) => handleUpdate(row.original.id, { content: Number(e.target.value) })}
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
          className="input-floating-label-form no-spinner text-right min-w-20"
          defaultValue={row.original.gross}
          onBlur={(e) => handleUpdate(row.original.id, { gross: Number(e.target.value) })}
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
          className="input-floating-label-form no-spinner text-right min-w-20"
          defaultValue={row.original.purity}
          onBlur={(e) => handleUpdate(row.original.id, { purity: Number(e.target.value) })}
        />
      ),
    },
    {
      id: 'bid',
      header: 'Bid',
      accessorKey: 'bid_premium',
      cell: ({ row }) => (
        <Input
          type="number"
          pattern="[0-9]*"
          className="input-floating-label-form no-spinner text-right min-w-14"
          defaultValue={row.original.bid_premium}
          onBlur={(e) => handleUpdate(row.original.id, { bid_premium: Number(e.target.value) })}
        />
      ),
    },
    {
      id: 'ask',
      header: 'Ask',
      accessorKey: 'ask_premium',
      cell: ({ row }) => (
        <Input
          type="number"
          pattern="[0-9]*"
          className="input-floating-label-form no-spinner text-right min-w-14"
          defaultValue={row.original.ask_premium}
          onBlur={(e) => handleUpdate(row.original.id, { ask_premium: Number(e.target.value) })}
        />
      ),
    },
    {
      id: 'quantity',
      header: 'Quantity',
      accessorKey: 'quantity',
      cell: ({ row }) => (
        <Input
          type="number"
          pattern="[0-9]*"
          className="input-floating-label-form no-spinner text-right min-w-14"
          defaultValue={row.original.quantity}
          onBlur={(e) => handleUpdate(row.original.id, { stock: Number(e.target.value) })}
        />
      ),
    },
    {
      id: 'display',
      header: 'Display?',
      accessorKey: 'display',
      cell: ({ row }) => (
        <Switch
          checked={row.original.display}
          onCheckedChange={(checked) => handleUpdate(row.original.id, { display: checked })}
        />
      ),
    },
    {
      id: 'variant_group',
      header: 'Variant Group',
      accessorKey: 'variant_group',
      cell: ({ row }) => (
        <Input
          type="text"
          className="input-floating-label-form min-w-48"
          defaultValue={row.original.variant_group}
          onBlur={(e) => handleUpdate(row.original.id, { variant_group: e.target.value })}
        />
      ),
    },
    {
      id: 'homepage_display',
      header: 'Featured?',
      accessorKey: 'homepage_display',
      cell: ({ row }) => (
        <Switch
          checked={row.original.homepage_display}
          onCheckedChange={(checked) =>
            handleUpdate(row.original.id, { homepage_display: checked })
          }
        />
      ),
    },
    {
      id: 'filter_category',
      header: 'Filter Category',
      accessorKey: 'filter_category',
      cell: ({ row }) => (
        <Input
          type="text"
          className="input-floating-label-form min-w-36"
          defaultValue={row.original.filter_category}
          onBlur={(e) => handleUpdate(row.original.id, { filter_category: e.target.value })}
        />
      ),
    },
    {
      id: 'shadow_offset',
      header: 'Offset',
      accessorKey: 'shadow_offset',
      cell: ({ row }) => (
        <Input
          type="number"
          pattern="[0-9]*"
          className="input-floating-label-form no-spinner text-right min-w-14"
          defaultValue={row.original.shadow_offset}
          onBlur={(e) => handleUpdate(row.original.id, { shadow_offset: Number(e.target.value) })}
        />
      ),
    },
    {
      id: 'delete',
      header: 'Delete',
      cell: ({ row }) => {
        const [open, setOpen] = React.useState(false)
        const product = row.original

        const handleConfirmDelete = () => {
          deleteProduct.mutate(product)
          setOpen(false)
        }

        return (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive hover:bg-background"
              >
                <Trash2 size={20} />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Are you sure?</DialogTitle>
              </DialogHeader>
              <div className="text-sm text-neutral-700">
                This will permanently delete <strong>{product.product_name}</strong>. You can't undo
                this action.
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
    data: filteredProducts,
    columns: columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      pagination,
      columnFilters,
      columnVisibility,
    },
    onPaginationChange: setPagination,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    autoResetPageIndex: false,
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

  const getHeaderAlignment = (id: string) => {
    return id === 'product_name' ? 'text-left' : 'text-center'
  }

  return (
    <div className="space-y-4 w-full">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <Button
          variant="ghost"
          className="flex items-center gap-1 mr-auto text-primary-gradient p-0"
          size="sm"
          onClick={() => createProduct.mutate()}
          disabled={products.some((p) => p.product_name.trim() === '')}
        >
          <Plus size={16} color={getPrimaryIconStroke()} />
          Create New
        </Button>

        <div className="flex flex-1 sm:flex-0 gap-2 w-full sm:ml-auto">
          {(['general', 'details', 'display'] as const).map((tab) => (
            <Button
              key={tab}
              variant="outline"
              className={cn(
                'text-sm raised-off-page w-full sm:w-auto', // full width below sm
                activeTab === tab ? 'liquid-gold' : 'bg-card hover:bg-card border-none'
              )}
              onClick={() => {
                setActiveTab(tab)
                setColumnVisibility(getColumnVisibilityForTab(tab))
              }}
            >
              <div
                className={cn(
                  activeTab === tab ? 'text-white hover:text-white' : 'text-primary-gradient'
                )}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </div>
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-center">
        <DebouncedInput
          type="text"
          placeholder="Search by product name..."
          value={String(table.getColumn('name')?.getFilterValue() ?? '')}
          onChange={(value) => table.getColumn('name')?.setFilterValue(value)}
        />
      </div>

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
                  className={`align-middle h-10 text-xs text-neutral-600 ${getHeaderAlignment(
                    header.column.id
                  )}`}
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
