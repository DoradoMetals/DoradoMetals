'use client'

import * as React from 'react'
import NextLink from 'next/link'
import { Button, Checkbox, Link } from '@dorado/components'
import { Plus, Trash2 } from '@dorado/icons'
import type {
  Action,
  RefiningLotPatch,
  RefiningLotView,
  RefiningPricingLine,
} from '@dorado/contracts'

import { RecordTable, recordColumns, type RecordColumn } from '@/shared/ui/RecordTable'
import { protectedRoutes } from '@/shared/types/routes'

import {
  DASH,
  formatMoney,
  formatPercent,
  formatWeight,
  lotSubtitle,
  parseWeight,
  percentToFraction,
} from '../_lib'
import { RefinerCardShell, type RefinerCardContent } from './RefinerCardShell'
import { RefinerLotCell } from './RefinerLotCell'

export type RefinerLotsProps = {
  direction: 'sell' | 'buy'
  lots: RefiningLotView[]
  prices: RefiningPricingLine[]
  content?: RefinerCardContent
  layout?: 'desktop' | 'mobile'
  editLots?: Action
  editable: boolean
  selectable?: boolean
  selected?: ReadonlySet<string>
  onSelectedChange?: (selected: Set<string>) => void
  onAction: (action: Action, run: () => void) => void
  onPatch: (row: RefiningLotView, patch: RefiningLotPatch) => void
  onRemove: (rows: RefiningLotView[]) => void
  onAdd: () => void
  onRetry?: () => void
}

const column = recordColumns<RefiningLotView>()

const isBullion = (row: RefiningLotView) => row.lot.bullion_id !== null

const isReturned = (row: RefiningLotView) => row.returned_at !== null

const selectableRow = (row: RefiningLotView) =>
  !isReturned(row) && row.released_at === null && row.settled_at === null

function lotColumns({
  direction,
  pricedBeforeSettle,
  prices,
  editable,
  selected,
  onToggle,
  onToggleAll,
  allSelected,
  someSelected,
  selectable,
  commit,
}: {
  direction: 'sell' | 'buy'
  pricedBeforeSettle: boolean
  prices: RefiningPricingLine[]
  editable: boolean
  selected: ReadonlySet<string>
  onToggle: (id: string, on: boolean) => void
  onToggleAll: (on: boolean) => void
  allSelected: boolean
  someSelected: boolean
  selectable: boolean
  commit: (row: RefiningLotView, patch: RefiningLotPatch) => void
}): RecordColumn<RefiningLotView>[] {
  const price = (row: RefiningLotView) =>
    isReturned(row) || (!pricedBeforeSettle && row.settled_at === null)
      ? DASH
      : formatMoney(prices.find((line) => line.lot_id === row.lot_id)?.price)
  const editableRow = (row: RefiningLotView) =>
    editable && !isReturned(row) && row.settled_at === null
  const name = (row: RefiningLotView) => row.lot.product_name ?? row.lot.form ?? row.lot.metal_id

  const select = selectable
    ? [
        column.display({
          id: 'select',
          header: () => (
            <Checkbox
              aria-label="Select all lots"
              checked={allSelected ? true : someSelected ? 'indeterminate' : false}
              onCheckedChange={(value) => onToggleAll(value === true)}
            />
          ),
          cell: ({ row }) => (
            <Checkbox
              aria-label={`Select ${name(row.original)}`}
              disabled={!selectableRow(row.original)}
              checked={selected.has(row.original.id)}
              onCheckedChange={(value) => onToggle(row.original.id, value === true)}
            />
          ),
          meta: { line: 0 },
        }),
      ]
    : []

  const scrap =
    direction === 'sell'
      ? [
          column.display({
            id: 'post_melt',
            header: 'Post Melt',
            cell: ({ row }) =>
              isBullion(row.original) ? (
                DASH
              ) : (
                <RefinerLotCell
                  label={`Post melt, ${name(row.original)}`}
                  value={formatWeight(row.original.lot.post_melt)}
                  unit={row.original.lot.unit}
                  editable={editableRow(row.original)}
                  onCommit={(text) => commit(row.original, { post_melt: parseWeight(text) })}
                />
              ),
            meta: { line: 2, cardLabel: 'Post Melt' },
          }),
          column.display({
            id: 'purity',
            header: 'Purity',
            cell: ({ row }) =>
              isBullion(row.original) ? (
                DASH
              ) : (
                <RefinerLotCell
                  label={`Purity, ${name(row.original)}`}
                  value={formatPercent(row.original.lot.purity)}
                  unit="%"
                  editable={editableRow(row.original)}
                  onCommit={(text) => commit(row.original, { purity: percentToFraction(text) })}
                />
              ),
            meta: { line: 3, cardLabel: 'Purity' },
          }),
        ]
      : []

  const spot =
    direction === 'sell'
      ? [
          column.display({
            id: 'spot',
            header: 'Spot',
            cell: ({ row }) =>
              isReturned(row.original) ? 'Returned' : formatMoney(row.original.lot.settled_spot),
            meta: { line: 5, cardLabel: 'Spot', numeric: true },
          }),
        ]
      : []

  return column.columns([
    ...select,
    column.display({
      id: 'item',
      header: 'Item',
      cell: ({ row }) => (
        <span className="flex min-w-0 flex-col gap-3xs">
          <span className="truncate text-small font-medium text-foreground">
            {name(row.original)}
          </span>
          <span className="truncate text-micro text-muted-foreground">
            {lotSubtitle(row.original.sources, row.original.lot.reference)}
          </span>
        </span>
      ),
      meta: { line: 0, fill: true },
    }),
    column.display({
      id: 'order',
      header: 'Order',
      cell: ({ row }) =>
        row.original.order_id && row.original.order_reference ? (
          <Link asChild intent="neutral">
            <NextLink href={`${protectedRoutes.adminOrders.path}/${row.original.order_id}`}>
              {row.original.order_reference}
            </NextLink>
          </Link>
        ) : (
          (row.original.order_reference ?? DASH)
        ),
      meta: { line: 0, end: true },
    }),
    column.display({
      id: 'qty',
      header: 'Qty',
      cell: ({ row }) => (isBullion(row.original) ? String(row.original.lot.quantity) : DASH),
      meta: { line: 1, cardLabel: 'Qty' },
    }),
    ...scrap,
    column.display({
      id: 'premium',
      header: 'Premium',
      cell: ({ row }) => (
        <RefinerLotCell
          label={`Premium, ${name(row.original)}`}
          value={formatPercent(row.original.lot.premium)}
          unit="%"
          editable={editableRow(row.original)}
          onCommit={(text) => commit(row.original, { premium: percentToFraction(text) })}
        />
      ),
      meta: { line: 4, cardLabel: 'Premium' },
    }),
    ...spot,
    column.display({
      id: 'price',
      header: 'Price',
      cell: ({ row }) => price(row.original),
      meta: { line: 6, cardLabel: 'Price', numeric: true },
    }),
  ])
}

export function RefinerLots({
  direction,
  lots,
  prices,
  content = 'loaded',
  layout = 'desktop',
  editLots,
  editable,
  selectable = editLots !== undefined,
  selected: chosenIds,
  onSelectedChange,
  onAction,
  onPatch,
  onRemove,
  onAdd,
  onRetry,
}: RefinerLotsProps) {
  const [own, setOwn] = React.useState<Set<string>>(new Set())
  const selected = chosenIds ?? own
  const setSelected = (next: Set<string> | ((current: ReadonlySet<string>) => Set<string>)) => {
    const value = typeof next === 'function' ? next(selected) : next
    if (onSelectedChange) onSelectedChange(value)
    else setOwn(value)
  }
  const held = lots.filter(selectableRow)
  const chosen = held.filter((row) => selected.has(row.id))

  const toggle = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const commit = (row: RefiningLotView, patch: RefiningLotPatch) =>
    editLots ? onAction(editLots, () => onPatch(row, patch)) : onPatch(row, patch)

  const shown: RefinerCardContent = content === 'loaded' && lots.length === 0 ? 'empty' : content

  return (
    <section aria-label="Lots" data-layout={layout}>
      <RefinerCardShell
        label="Lots"
        content={shown}
        actions={
          editLots ? (
            <span className="flex items-center gap-xs">
              <Button size="iconSm" aria-label="Add lot" onClick={onAdd}>
                <Plus aria-hidden />
              </Button>
              <Button
                size="iconSm"
                variant="secondary"
                intent="danger"
                aria-label="Remove selected lots"
                disabled={chosen.length === 0}
                onClick={() =>
                  onAction(editLots, () => {
                    onRemove(chosen)
                    setSelected(new Set())
                  })
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </span>
          ) : undefined
        }
        emptyTitle="No lots yet"
        emptyDescription="Add lots before you send this order to the refiner."
        errorTitle="Couldn’t load lots"
        onRetry={onRetry}
      >
        <RecordTable
          columns={lotColumns({
            direction,
            pricedBeforeSettle: direction === 'buy',
            prices,
            editable,
            selected,
            onToggle: toggle,
            onToggleAll: (on) => setSelected(on ? new Set(held.map((row) => row.id)) : new Set()),
            allSelected: held.length > 0 && chosen.length === held.length,
            someSelected: chosen.length > 0,
            selectable,
            commit,
          })}
          data={lots}
          label="Lots"
          layout={layout === 'mobile' ? 'cards' : 'table'}
          getRowId={(row) => row.id}
          empty={null}
        />
      </RefinerCardShell>
    </section>
  )
}
