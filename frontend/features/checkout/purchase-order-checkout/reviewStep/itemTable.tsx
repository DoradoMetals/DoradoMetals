'use client'

import { Table, TableBody, TableCell, TableRow } from '@/shared/ui/base/table'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { useReactTable, getCoreRowModel, flexRender, ColumnDef } from '@tanstack/react-table'
import { sellCartStore } from '@/shared/store/sellCartStore'
import { cn } from '@/shared/utils/cn'
import { SellCartItem } from '@/features/cart/types'
import { formatRate } from '@/features/rates/utils/resolveRate'
import { usePurchaseOrderCheckoutStore } from '@/shared/store/purchaseOrderCheckoutStore'
import { payoutOptions } from '@/features/payouts/types'
import { usePurchaseOrderQuote } from '@/features/quotes/queries'
import type { PurchaseOrderQuoteLine } from '@dorado/contracts'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'

// A cart line paired with its quote line. Absent until the first quote lands
// (or if the server refused the quote) - those rows price at zero, never
// client-side.
type QuotedRow<T extends SellCartItem['type']> = {
  item: Extract<SellCartItem, { type: T }>
  line: PurchaseOrderQuoteLine | undefined
}

export default function ReviewItemTables() {
  const shippingCost = usePurchaseOrderCheckoutStore((state) => state.data.service?.netCharge)
  const payout = usePurchaseOrderCheckoutStore((state) => state.data.payout)
  const paymentCost = payoutOptions.find((p) => p.method === payout?.method)?.cost ?? 0

  const items = sellCartStore((state) => state.items)
  const { data: quote } = usePurchaseOrderQuote(items)

  // Quote lines carry the request array position, and the store's items array
  // IS the request array - so the pairing happens by index, BEFORE any
  // filtering into scrap and bullion.
  const rows = useMemo(() => {
    const byIndex = new Map((quote?.items ?? []).map((line) => [line.index, line]))
    return items.map((item, index) => ({ item, line: byIndex.get(index) }))
  }, [items, quote])

  const scrapRows = useMemo(
    () => rows.filter((row): row is QuotedRow<'scrap'> => row.item.type === 'scrap'),
    [rows]
  )
  const bullionRows = useMemo(
    () => rows.filter((row): row is QuotedRow<'product'> => row.item.type === 'product'),
    [rows]
  )

  const scrapTotal = useMemo(
    () => scrapRows.reduce((acc, row) => acc + (row.line?.line_total ?? 0), 0),
    [scrapRows]
  )
  const bullionTotal = useMemo(
    () => bullionRows.reduce((acc, row) => acc + (row.line?.line_total ?? 0), 0),
    [bullionRows]
  )

  const total = useMemo(() => {
    return (quote?.total ?? 0) - (shippingCost ?? 0 + paymentCost)
  }, [quote, shippingCost, paymentCost])

  const shippingRow = useMemo(() => {
    const label =
      usePurchaseOrderCheckoutStore.getState().data.service?.serviceDescription ?? 'Unknown Service'
    return [{ label, cost: shippingCost ?? 0 }]
  }, [shippingCost])

  const payoutRow = useMemo(() => {
    const method = payoutOptions.find((p) => p.method === payout?.method)
    if (!method) return []
    return [{ label: method.label, cost: method.cost }]
  }, [payout])

  const [open, setOpen] = useState({
    scrap: false,
    bullion: false,
    shipping: false,
    payout: false,
  })

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2>Estimated Payout</h2>
        <strong>
          <PriceNumberFlow value={total ?? 0} />
        </strong>
      </div>

      {scrapRows.length > 0 && (
        <ItemAccordion
          label="Scrap"
          total={scrapTotal}
          open={open.scrap}
          toggle={() => setOpen((prev) => ({ ...prev, scrap: !prev.scrap }))}
          rows={scrapRows}
          columns={scrapColumns}
        />
      )}

      {bullionRows.length > 0 && (
        <ItemAccordion
          label="Bullion"
          total={bullionTotal}
          open={open.bullion}
          toggle={() => setOpen((prev) => ({ ...prev, bullion: !prev.bullion }))}
          rows={bullionRows}
          columns={bullionColumns}
        />
      )}
      {shippingRow.length > 0 && (
        <ItemAccordion
          label="Shipping"
          total={shippingCost ?? 0}
          open={open.shipping}
          toggle={() => setOpen((prev) => ({ ...prev, shipping: !prev.shipping }))}
          rows={shippingRow}
          columns={costSummaryColumns}
        />
      )}

      {payoutRow.length > 0 && payoutRow[0].cost > 0 && (
        <ItemAccordion
          label="Payout Method Fee"
          total={payoutRow[0].cost}
          open={open.payout}
          toggle={() => setOpen((prev) => ({ ...prev, payout: !prev.payout }))}
          rows={payoutRow}
          columns={costSummaryColumns}
        />
      )}
    </div>
  )
}

function ItemAccordion<T>({
  label,
  total,
  open,
  toggle,
  rows,
  columns,
}: {
  label: string
  total: number
  open: boolean
  toggle: () => void
  rows: T[]
  columns: ColumnDef<T>[]
}) {
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className={cn(
          'cursor-pointer w-full p-4 flex items-center justify-between',
          label === 'Bullion' && 'border-t-1 border-border'
        )}
      >
        <div className="flex items-center gap-2">
          <ChevronDown
            size={20}
            className={cn('transition-transform text-neutral-500', open && 'rotate-180')}
          />
          <span>{label}</span>
        </div>
        <strong>
          {label === 'Shipping' || label === 'Payout Method Fee' ? (
            <>
              -<PriceNumberFlow value={total} />
            </>
          ) : (
            <PriceNumberFlow value={total} />
          )}
        </strong>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key={label}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden will-change-transform"
          >
            <div className="px-2">
              <Table className="w-full">
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} borderless>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell className="text-left" key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const scrapColumns: ColumnDef<QuotedRow<'scrap'>>[] = [
  {
    header: 'Name',
    cell: ({ row }) => row.original.item.data.name || 'Unnamed',
  },
  {
    header: 'Weight',
    cell: ({ row }) => (
      <div>
        {row.original.item.data.pre_melt} {row.original.item.data.gross_unit}
      </div>
    ),
  },
  {
    header: 'Purity',
    cell: ({ row }) => <span>{(row.original.item.data.purity * 100).toFixed(2)}%</span>,
  },
  {
    header: 'Rate',
    // The quote's premium is the rates-band resolution; the cart's own
    // bid_premium only shows while no quote has landed.
    cell: ({ row }) => (
      <span>{formatRate(row.original.line?.premium ?? row.original.item.data.bid_premium)}</span>
    ),
  },
  {
    header: 'Est. Value',
    cell: ({ row }) => (
      <span className="text-right block w-full">
        <PriceNumberFlow value={row.original.line?.line_total ?? 0} />
      </span>
    ),
  },
]

const bullionColumns: ColumnDef<QuotedRow<'product'>>[] = [
  {
    header: 'Qty',
    cell: ({ row }) => row.original.item.data.quantity ?? 1,
  },
  {
    header: 'Name',
    cell: ({ row }) => row.original.item.data.name,
  },
  {
    header: 'Est. Value',
    cell: ({ row }) => (
      <span className="text-right block w-full">
        <PriceNumberFlow value={row.original.line?.line_total ?? 0} />
      </span>
    ),
  },
]

const costSummaryColumns: ColumnDef<{ label: string; cost: number }>[] = [
  {
    header: 'Type',
    accessorKey: 'label',
    cell: (info) => info.getValue(),
  },
  {
    header: 'Cost',
    accessorKey: 'cost',
    cell: ({ getValue }) => {
      const value = getValue<number>()
      return (
        <span className="text-right block w-full">
          -<PriceNumberFlow value={value} />
        </span>
      )
    },
  },
]
