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
import { usePaymentMethods } from '@/features/payments/queries'
import { usePurchaseOrderQuote } from '@/features/quotes/queries'
import type { quotes } from "@dorado/contracts";
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'

// A cart line paired with its quote line. Absent until the first quote lands
// (or if the server refused the quote) - those rows price at zero, never
// client-side.
type QuotedRow = {
  item: SellCartItem
  line: quotes.PurchaseOrderQuoteLine | undefined
  premium: number | undefined
}

export default function ReviewItemTables() {
  const shippingCost = usePurchaseOrderCheckoutStore((state) => state.data.service?.netCharge)
  const payout = usePurchaseOrderCheckoutStore((state) => state.data.payout)
  const { data: payoutMethods = [] } = usePaymentMethods('purchase')
  const paymentCost = Number(payoutMethods.find((p) => p.type === payout?.method)?.flat_fee ?? 0)

  const items = sellCartStore((state) => state.items)
  const premiums = sellCartStore((state) => state.premiums)
  const { data: quote } = usePurchaseOrderQuote(items, {
    shipping_charge: shippingCost ?? undefined,
    payout_method: payout?.method,
  })

  // Quote lines carry the request array position, and the store's items array
  // IS the request array - so the pairing happens by index, BEFORE any
  // filtering into scrap and bullion.
  const rows = useMemo(() => {
    const byIndex = new Map((quote?.items ?? []).map((line) => [line.index, line]))
    return items.map((item, index) => ({
      item,
      line: byIndex.get(index),
      premium: premiums[item.id],
    }))
  }, [items, quote, premiums])

  const scrapRows = useMemo(() => rows.filter((row) => row.item.bullion_id === null), [rows])
  const bullionRows = useMemo(() => rows.filter((row) => row.item.bullion_id !== null), [rows])

  const scrapTotal = useMemo(
    () => scrapRows.reduce((acc, row) => acc + (row.line?.line_total ?? 0), 0),
    [scrapRows]
  )
  const bullionTotal = useMemo(
    () => bullionRows.reduce((acc, row) => acc + (row.line?.line_total ?? 0), 0),
    [bullionRows]
  )

  // THE SERVER'S NUMBER, not ours (D82, D97).
  //
  // This was `(quote?.total ?? 0) - (shippingCost ?? 0 + paymentCost)`, and `+`
  // binds tighter than `??`, so it parsed as `shippingCost ?? (0 + paymentCost)`
  // - when a service was selected the whole parenthesis collapsed to the
  // shipping charge and THE PAYOUT FEE WAS SILENTLY DISCARDED. The headline
  // figure above Confirm and Place Order read up to $20 high, and it
  // contradicted the Shipping and Payout Method Fee rows printed directly
  // beneath it.
  //
  // The fix is not the missing parenthesis. It is that this component has no
  // business subtracting anything: the quote endpoint now applies both
  // deductions and returns `estimated_payout`, so the arithmetic exists in one
  // place that is tested rather than in a component.
  const total = quote?.estimated_payout ?? 0

  const shippingRow = useMemo(() => {
    const label =
      usePurchaseOrderCheckoutStore.getState().data.service?.serviceDescription ?? 'Unknown Service'
    return [{ label, cost: shippingCost ?? 0 }]
  }, [shippingCost])

  const payoutRow = useMemo(() => {
    const method = payoutMethods.find((p) => p.type === payout?.method)
    if (!method) return []
    return [{ label: method.label, cost: Number(method.flat_fee ?? 0) }]
  }, [payout, payoutMethods])

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
            className={cn('transition-transform text-placeholder', open && 'rotate-180')}
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

const scrapColumns: ColumnDef<QuotedRow>[] = [
  {
    header: 'Name',
    cell: ({ row }) => row.original.item.name || 'Unnamed',
  },
  {
    header: 'Weight',
    cell: ({ row }) => (
      <div>
        {row.original.item.pre_melt} {row.original.item.unit}
      </div>
    ),
  },
  {
    header: 'Purity',
    cell: ({ row }) => <span>{((row.original.item.purity ?? 0) * 100).toFixed(2)}%</span>,
  },
  {
    header: 'Rate',
    cell: ({ row }) => (
      <span>{formatRate(row.original.line?.premium ?? row.original.premium)}</span>
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

const bullionColumns: ColumnDef<QuotedRow>[] = [
  {
    header: 'Qty',
    cell: ({ row }) => row.original.item.quantity ?? 1,
  },
  {
    header: 'Name',
    cell: ({ row }) => row.original.item.name,
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
