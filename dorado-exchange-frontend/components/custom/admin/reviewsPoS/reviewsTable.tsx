import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
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
import { ChevronLeft, ChevronRight, Settings, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { EyeSlashIcon, EyeIcon } from '@phosphor-icons/react'
import { useReviews } from '@/lib/queries/useReviews'
import type { Review, ReviewCard } from '@/types/reviews'
import { useDrawerStore } from '@/store/drawerStore'
import { Rating, RatingButton } from '@/components/ui/rating'
import ReviewsDrawer from './reviewsDrawer'

export default function ReviewsTable({
  setOpen,
  selectedCard,
}: {
  setOpen: (open: boolean) => void
  selectedCard: ReviewCard
}) {
  const { data: reviews = [] } = useReviews()
  const { openDrawer } = useDrawerStore()
  const [activeReview, setActiveReview] = useState<string | null>(null)

  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const filtered = useMemo<Review[]>(() => {
    if (!selectedCard) return reviews
    if (selectedCard === 'Hidden') return reviews.filter((r) => r.hidden)
    const star = Number(selectedCard?.[0])
    if (Number.isFinite(star)) return reviews.filter((r) => Math.round(r.rating) === star)
    return reviews
  }, [reviews, selectedCard])

  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }))
  }, [selectedCard])

  const columns: ColumnDef<Review>[] = [
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
      id: 'rating',
      header: () => <span className="flex justify-center text-sm text-neutral-600">Rating</span>,
      accessorKey: 'rating',
      cell: ({ row }) => (
        <div className="flex justify-center">
          <Rating value={row.original.rating} readOnly>
            {Array.from({ length: 5 }).map((_, i) => (
              <RatingButton key={i} size={28} className="transition-transform text-primary" />
            ))}
          </Rating>
        </div>
      ),
    },
    {
      id: 'review_text',
      header: () => <span className="text-sm text-neutral-600">Review</span>,
      accessorKey: 'review_text',
      filterFn: 'includesString',
      cell: ({ row }) => (
        <div className="text-xs sm:text-sm text-neutral-900 line-clamp-2 max-w-[38ch]">
          {row.original.review_text}
        </div>
      ),
    },
    {
      id: 'hidden',
      header: () => (
        <span className="flex justify-center text-sm text-neutral-600">Visibility</span>
      ),
      accessorKey: 'hidden',
      cell: ({ row }) => (
        <div className="flex justify-center">
          {row.original.hidden ? (
            <EyeSlashIcon size={32} className="text-destructive" />
          ) : (
            <EyeIcon size={32} className="text-success" />
          )}
        </div>
      ),
    },
    {
      id: 'created_at',
      header: () => <span className="flex justify-center text-sm text-neutral-600">Created</span>,
      accessorKey: 'created_at',
      cell: ({ row }) => (
        <div className="flex justify-center text-xs sm:text-sm text-neutral-900">
          {new Date(row.original.created_at).toLocaleDateString()}
        </div>
      ),
    },
  ]

  const table = useReactTable({
    data: filtered,
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
          setActiveReview(row.original.id)
          openDrawer('reviews')
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
      <div className="flex flex-col">
        <Button
          variant="ghost"
          className="flex items-center gap-1 text-primary-gradient p-0 mr-auto"
          size="sm"
          onClick={() => setOpen(true)}
        >
          Create New Review
        </Button>

        <div className="gap-2 flex flex-col sm:flex-row sm:items-start sm:justify-between w-full">
          <div className="flex w-full gap-2">
            <div className="w-full">
              <DebouncedInput
                type="text"
                placeholder="Search by reviewer name..."
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
                    <label htmlFor={`col-${column.id}`} className="text-sm cursor-pointer">
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

      {activeReview && <ReviewsDrawer review_id={activeReview} reviews={reviews} />}
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
