'use client'

import * as React from 'react'
import { Autocomplete, Button, EmptyState, Input, Link, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dorado/components'
import { Trash2 } from '@dorado/icons'
import type { RefiningLotPatch, RefiningLotView } from '@dorado/contracts'

import { OrderCard } from './OrderCard'
import { DASH, money, ounces, percent, premium as asPremium } from './format'

export type RefiningItemsCardProps = {
  lots: RefiningLotView[]
  kindLabel: string
  query: string
  onQueryChange: (value: string) => void
  onEdit: (lot_id: string, patch: RefiningLotPatch) => void
  onDelete: (lot_id: string) => void
  onAdd: (lot_ids: string[]) => void
  pending?: boolean
}

// The refiner's table: Item · Lot · Order · Weight · Purity · Premium · Value.
// A refiner line carries the customer order the metal came off, because that
// pairing is the margin - and it is one SQL read, not a join written here.
export function RefiningItemsCard({
  lots,
  kindLabel,
  query,
  onQueryChange,
  onEdit,
  onDelete,
  onAdd,
  pending = false,
}: RefiningItemsCardProps) {
  const total = lots.reduce((sum, lot) => sum + (lot.content ?? 0), 0)

  return (
    <OrderCard
      title={kindLabel}
      summary={ounces(total)}
      right={
        <div className="flex w-[420px] items-end gap-xs">
          <Autocomplete
            value={query}
            onValueChange={onQueryChange}
            items={[]}
            onSelect={() => undefined}
            placeholder="Search lots…"
            empty="Lot search has no route yet."
            className="flex-1"
          />
          <Button variant="secondary" disabled onClick={() => onAdd([])}>
            Add Lot
          </Button>
        </div>
      }
    >
      {lots.length === 0 ? (
        <EmptyState title="No lots on this order" description="Batch lots into it from an order." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Lot</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Weight</TableHead>
              <TableHead>Purity</TableHead>
              <TableHead>Premium</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lots.map((lot) => (
              <TableRow key={lot.id}>
                <TableCell>{lot.lot.product_name ?? lot.lot.metal_id}</TableCell>
                <TableCell>
                  <Link href={`/admin/lots/${lot.lot_id}`}>{lot.lot.reference ?? DASH}</Link>
                </TableCell>
                <TableCell>
                  {lot.order_number
                    ? `${lot.order_direction === 'sale' ? 'SO' : 'PO'}-${lot.order_number}`
                    : DASH}
                </TableCell>
                <TableCell>
                  <NumberCell
                    value={lot.post_melt ?? lot.pre_melt}
                    onCommit={(post_melt) => onEdit(lot.id, { post_melt })}
                  />
                </TableCell>
                <TableCell>
                  <NumberCell
                    value={lot.purity}
                    display={percent(lot.purity)}
                    onCommit={(purity) => onEdit(lot.id, { purity })}
                  />
                </TableCell>
                <TableCell>
                  <NumberCell
                    value={lot.premium}
                    display={asPremium(lot.premium)}
                    onCommit={(premium) => onEdit(lot.id, { premium })}
                  />
                </TableCell>
                <TableCell className="text-right">{money(lot.customer_premium)}</TableCell>
                <TableCell>
                  <Button
                    variant="secondary"
                    intent="danger"
                    size="iconSm"
                    aria-label={`Remove ${lot.lot.reference ?? 'lot'}`}
                    icon={Trash2}
                    disabled={pending}
                    onClick={() => onDelete(lot.id)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </OrderCard>
  )
}

function NumberCell({
  value,
  display,
  onCommit,
}: {
  value: number | null
  display?: string
  onCommit: (next: number) => void
}) {
  const asText = value === null ? '' : String(value)
  const [draft, setDraft] = React.useState(asText)
  React.useEffect(() => setDraft(asText), [asText])

  return (
    <Input
      type="number"
      inputMode="decimal"
      value={draft}
      aria-label={display ?? 'value'}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = Number(draft)
        if (!Number.isFinite(next) || next === value) return
        onCommit(next)
      }}
    />
  )
}
