'use client'

import { Table, TableBody, TableCell, TableRow } from '@/shared/ui/base/table'
import { Accordion } from '@dorado/components'
import { useMemo, useState } from 'react'
import { useReactTable, getCoreRowModel, flexRender, ColumnDef } from '@tanstack/react-table'
import { useCheckoutItems } from '@/shared/store/checkoutItemsStore'
import { useDecoratedLines, type DecoratedLine } from '@/features/checkout/items/flair'
import { formatRate } from '@/features/rates/utils/resolveRate'
import { usePurchaseOrderCheckoutStore } from '@/shared/store/purchaseOrderCheckoutStore'
import { usePaymentMethods } from '@/features/payments/queries'
import { usePurchaseOrderQuote } from '@/features/quotes/queries'
import type { PurchaseOrderQuoteLine } from "@dorado/contracts";
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'

// A basket line paired with its quote line. Absent until the first quote lands
// (or if the server refused the quote) - those rows price at zero, never
// client-side.
type QuotedRow = DecoratedLine & { quoted: PurchaseOrderQuoteLine | undefined }

export default function ReviewItemTables() {
  const shippingCost = usePurchaseOrderCheckoutStore((state) => state.data.service?.netCharge)
  const payout = usePurchaseOrderCheckoutStore((state) => state.data.payout)
  const { data: payoutMethods = [] } = usePaymentMethods('purchase')
  const paymentCost = Number(payoutMethods.find((p) => p.type === payout?.method)?.flat_fee ?? 0)

  const items = useCheckoutItems((state) => state.purchase)
  const decorated = useDecoratedLines(items)
  const { data: quote } = usePurchaseOrderQuote(items, {
    shipping_charge: shippingCost ?? undefined,
    payout_method: payout?.method,
  })

  // Quote lines carry the request array position, and the store's items array
  // IS the request array - so the pairing happens by index, BEFORE any
  // filtering into scrap and bullion.
  const rows: QuotedRow[] = useMemo(() => {
    const byIndex = new Map((quote?.items ?? []).map((line) => [line.index, line]))
    return decorated.map((row) => ({ ...row, quoted: byIndex.get(row.index) }))
  }, [decorated, quote])

  const scrapRows = useMemo(() => rows.filter((row) => !row.line.bullion_id), [rows])
  const bullionRows = useMemo(() => rows.filter((row) => !!row.line.bullion_id), [rows])

  const scrapTotal = useMemo(
    () => scrapRows.reduce((acc, row) => acc + (row.quoted?.line_total ?? 0), 0),
    [scrapRows]
  )
  const bullionTotal = useMemo(
    () => bullionRows.reduce((acc, row) => acc + (row.quoted?.line_total ?? 0), 0),
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
        <Accordion
          label="Scrap"
          trailing={
            <strong>
              <PriceNumberFlow value={scrapTotal} />
            </strong>
          }
          open={open.scrap}
          onToggle={() => setOpen((prev) => ({ ...prev, scrap: !prev.scrap }))}
          surface="bare"
        >
          <AccordionTable rows={scrapRows} columns={scrapColumns} />
        </Accordion>
      )}

      {bullionRows.length > 0 && (
        <Accordion
          label="Bullion"
          trailing={
            <strong>
              <PriceNumberFlow value={bullionTotal} />
            </strong>
          }
          open={open.bullion}
          onToggle={() => setOpen((prev) => ({ ...prev, bullion: !prev.bullion }))}
          surface="bare"
        >
          <AccordionTable rows={bullionRows} columns={bullionColumns} />
        </Accordion>
      )}
      {shippingRow.length > 0 && (
        <Accordion
          label="Shipping"
          trailing={
            <strong>
              -<PriceNumberFlow value={shippingCost ?? 0} />
            </strong>
          }
          open={open.shipping}
          onToggle={() => setOpen((prev) => ({ ...prev, shipping: !prev.shipping }))}
          surface="bare"
        >
          <AccordionTable rows={shippingRow} columns={costSummaryColumns} />
        </Accordion>
      )}

      {payoutRow.length > 0 && payoutRow[0].cost > 0 && (
        <Accordion
          label="Payout Method Fee"
          trailing={
            <strong>
              -<PriceNumberFlow value={payoutRow[0].cost} />
            </strong>
          }
          open={open.payout}
          onToggle={() => setOpen((prev) => ({ ...prev, payout: !prev.payout }))}
          surface="bare"
        >
          <AccordionTable rows={payoutRow} columns={costSummaryColumns} />
        </Accordion>
      )}
    </div>
  )
}

function AccordionTable<T>({ rows, columns }: { rows: T[]; columns: ColumnDef<T>[] }) {
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
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
  )
}

const scrapColumns: ColumnDef<QuotedRow>[] = [
  {
    header: 'Name',
    cell: ({ row }) => row.original.name,
  },
  {
    header: 'Weight',
    cell: ({ row }) => (
      <div>
        {row.original.line.pre_melt} {row.original.line.unit}
      </div>
    ),
  },
  {
    header: 'Purity',
    cell: ({ row }) => <span>{((row.original.line.purity ?? 0) * 100).toFixed(2)}%</span>,
  },
  {
    header: 'Rate',
    cell: ({ row }) => <span>{formatRate(row.original.quoted?.premium)}</span>,
  },
  {
    header: 'Est. Value',
    cell: ({ row }) => (
      <span className="text-right block w-full">
        <PriceNumberFlow value={row.original.quoted?.line_total ?? 0} />
      </span>
    ),
  },
]

const bullionColumns: ColumnDef<QuotedRow>[] = [
  {
    header: 'Qty',
    cell: ({ row }) => row.original.line.quantity ?? 1,
  },
  {
    header: 'Name',
    cell: ({ row }) => row.original.name,
  },
  {
    header: 'Est. Value',
    cell: ({ row }) => (
      <span className="text-right block w-full">
        <PriceNumberFlow value={row.original.quoted?.line_total ?? 0} />
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
