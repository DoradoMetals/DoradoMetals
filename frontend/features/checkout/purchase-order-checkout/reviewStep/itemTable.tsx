'use client'

import { Accordion, Amount, Table, TableBody, TableCell, TableRow } from '@dorado/components'
import { useMemo, useState } from 'react'
import { useBasket } from '@/features/checkout/items/queries'
import { cn } from '@/shared/utils/cn'
import { useDecoratedLines, type DecoratedLine } from '@/features/checkout/items/flair'
import { formatRate } from '@/features/rates/types'
import { usePaymentMethods } from '@dorado/client'
import { usePurchaseOrderQuote } from '@/features/quotes/queries'
import type { CheckoutRate, CheckoutView, PurchaseOrderQuoteLine } from "@dorado/contracts";

// A basket line paired with its quote line. Absent until the first quote lands
// (or if the server refused the quote) - those rows price at zero, never
// client-side.
type QuotedRow = DecoratedLine & { quoted: PurchaseOrderQuoteLine | undefined }

// The two deductions come from the row and the joined rate now, not from a
// store: `carrier_service_id` picks the rate the carrier quoted, and
// `payment_method_id` is the payout account the payout step sealed.
export default function ReviewItemTables({
  row,
  rates,
}: {
  row?: CheckoutView
  rates: CheckoutRate[]
}) {
  const shippingCost = rates.find((rate) => rate.selected)?.netCharge ?? undefined
  const { data: payoutMethods = [] } = usePaymentMethods('purchase')
  const payoutMethod = payoutMethods.find((p) => p.id === row?.payment_method_id)
  const paymentCost = Number(payoutMethod?.flat_fee ?? 0)

  const items = useBasket('purchase')
  const decorated = useDecoratedLines(items)
  const { data: quote } = usePurchaseOrderQuote(items, {
    shipping_charge: shippingCost ?? undefined,
    payout_method: payoutMethod?.type,
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

  const selectedRate = rates.find((rate) => rate.selected)
  const shippingRow = [
    { label: selectedRate?.name ?? 'Unknown Service', cost: shippingCost ?? 0 },
  ]
  const payoutRow = payoutMethod
    ? [{ label: payoutMethod.label, cost: Number(payoutMethod.flat_fee ?? 0) }]
    : []

  const [open, setOpen] = useState({
    scrap: false,
    bullion: false,
    shipping: false,
    payout: false,
  })

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3>Estimated Payout</h3>
        <strong>
          <Amount value={total ?? 0} />
        </strong>
      </div>

      {scrapRows.length > 0 && (
        <Accordion
          label="Scrap"
          trailing={
            <strong>
              <Amount value={scrapTotal} />
            </strong>
          }
          open={open.scrap}
          onToggle={() => setOpen((prev) => ({ ...prev, scrap: !prev.scrap }))}
          surface="bare"
        >
          <AccordionTable rows={scrapRows} cells={scrapCells} />
        </Accordion>
      )}

      {bullionRows.length > 0 && (
        <Accordion
          label="Bullion"
          trailing={
            <strong>
              <Amount value={bullionTotal} />
            </strong>
          }
          open={open.bullion}
          onToggle={() => setOpen((prev) => ({ ...prev, bullion: !prev.bullion }))}
          surface="bare"
        >
          <AccordionTable rows={bullionRows} cells={bullionCells} />
        </Accordion>
      )}
      {shippingRow.length > 0 && (
        <Accordion
          label="Shipping"
          trailing={
            <strong>
              -<Amount value={shippingCost ?? 0} />
            </strong>
          }
          open={open.shipping}
          onToggle={() => setOpen((prev) => ({ ...prev, shipping: !prev.shipping }))}
          surface="bare"
        >
          <AccordionTable rows={shippingRow} cells={costSummaryCells} />
        </Accordion>
      )}

      {payoutRow.length > 0 && payoutRow[0].cost > 0 && (
        <Accordion
          label="Payout Method Fee"
          trailing={
            <strong>
              -<Amount value={payoutRow[0].cost} />
            </strong>
          }
          open={open.payout}
          onToggle={() => setOpen((prev) => ({ ...prev, payout: !prev.payout }))}
          surface="bare"
        >
          <AccordionTable rows={payoutRow} cells={costSummaryCells} />
        </Accordion>
      )}
    </div>
  )
}

type Cell<T> = (row: T) => React.ReactNode

function AccordionTable<T>({ rows, cells }: { rows: T[]; cells: Cell<T>[] }) {
  return (
    <div className="px-2">
      <Table className="w-full">
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i} borderless>
              {cells.map((cell, j) => (
                <TableCell className="text-left" key={j}>
                  {cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

const scrapCells: Cell<QuotedRow>[] = [
  (row) => row.name,
  (row) => (
    <div>
      {row.line.pre_melt} {row.line.unit}
    </div>
  ),
  (row) => <span>{((row.line.purity ?? 0) * 100).toFixed(2)}%</span>,
  (row) => <span>{formatRate(row.quoted?.premium)}</span>,
  (row) => (
    <span className="text-right block w-full">
      <Amount value={row.quoted?.line_total ?? 0} />
    </span>
  ),
]

const bullionCells: Cell<QuotedRow>[] = [
  (row) => row.line.quantity ?? 1,
  (row) => row.name,
  (row) => (
    <span className="text-right block w-full">
      <Amount value={row.quoted?.line_total ?? 0} />
    </span>
  ),
]

const costSummaryCells: Cell<{ label: string; cost: number }>[] = [
  (row) => row.label,
  (row) => (
    <span className="text-right block w-full">
      -<Amount value={row.cost} />
    </span>
  ),
]
