'use client'

import * as React from 'react'
import {
  Autocomplete,
  Button,
  Checkbox,
  EmptyState,
  Input,
  Link,
  Select,
  cn,
  type AutocompleteItem,
} from '@dorado/components'
import { Package2, Plus, Trash2 } from '@dorado/icons'
import type { OrderLotPatch, OrderLotView } from '@dorado/contracts'

import { OrderCard } from './OrderCard'
import { DASH, money, percent, plain, premium as asPremium } from './format'

export type LotsKind = 'scrap' | 'bullion'

export type LotsCardProps = {
  kind: LotsKind
  lots: OrderLotView[]
  readOnly?: boolean
  onEdit: (lot_id: string, patch: OrderLotPatch) => void
  onNew: () => void
  onDelete: (lot_ids: string[]) => void
  onBatch: (lot_ids: string[]) => void
  refiners?: { id: string; name: string }[]
  refinerId?: string | null
  onRefinerChange?: (id: string) => void
  onCreateSale?: () => void
  createSaleDisabled?: boolean
  search?: {
    value: string
    onValueChange: (value: string) => void
    items: AutocompleteItem[]
    onSelect: (item: AutocompleteItem) => void
    onAdd: () => void
    chosen: boolean
    onClose: () => void
  }
  pending?: boolean
}

const SCRAP_HEAD = ['Item', 'Lot', 'Qty', 'Pre Melt', 'Post Melt', 'Purity', 'Premium', 'Price']
const BULLION_HEAD = ['Item', 'Lot', 'Qty', 'Premium', 'Price']

export function LotsCard({
  kind,
  lots,
  readOnly = false,
  onEdit,
  onNew,
  onDelete,
  onBatch,
  refiners,
  refinerId = null,
  onRefinerChange,
  onCreateSale,
  createSaleDisabled = false,
  search,
  pending = false,
}: LotsCardProps) {
  const [selected, setSelected] = React.useState<string[]>([])
  const head = kind === 'scrap' ? SCRAP_HEAD : BULLION_HEAD
  const nothingSelected = selected.length === 0
  const allSelected = lots.length > 0 && selected.length === lots.length

  const toggle = (id: string) =>
    setSelected((was) => (was.includes(id) ? was.filter((one) => one !== id) : [...was, id]))
  const toggleAll = () => setSelected(allSelected ? [] : lots.map((lot) => lot.id))

  const total = lots.reduce((sum, lot) => sum + (lot.line_total ?? 0), 0)
  const selectedLotIds = () =>
    selected
      .map((id) => lots.find((lot) => lot.id === id)?.lot_id)
      .filter((id): id is string => !!id)

  return (
    <OrderCard
      title={search ? 'Lots' : kind === 'scrap' ? 'Lots' : 'Items'}
      summary={`${lots.length} · ${money(total)}`}
      right={
        <>
          {refiners && onRefinerChange && (
            <div className="w-full lg:w-[220px]">
              <Select
                label="Refiner"
                items={refiners.map((one) => ({ value: one.id, label: one.name }))}
                value={refinerId ?? undefined}
                onValueChange={onRefinerChange}
                placeholder="Choose a refiner"
              />
            </div>
          )}
          {readOnly ? (
            onCreateSale && (
              <Button
                variant="primary"
                disabled={createSaleDisabled || pending || (!!refiners && !refinerId)}
                onClick={onCreateSale}
              >
                Create Sale
              </Button>
            )
          ) : search ? (
            <AddingLot search={search} />
          ) : (
            <>
              <Button
                variant="primary"
                size="icon"
                aria-label="New"
                title="New"
                icon={Plus}
                disabled={pending}
                onClick={onNew}
              />
              <Button
                variant="secondary"
                size="icon"
                aria-label="Batch"
                title="Batch"
                icon={Package2}
                disabled={nothingSelected || pending || (!!refiners && !refinerId)}
                onClick={() => onBatch(selectedLotIds())}
              />
              <Button
                variant="secondary"
                intent="danger"
                size="icon"
                aria-label="Delete"
                title="Delete"
                icon={Trash2}
                disabled={nothingSelected || pending}
                onClick={() => {
                  onDelete(selected)
                  setSelected([])
                }}
              />
            </>
          )}
        </>
      }
    >
      {lots.length === 0 ? (
        <EmptyState title="No lots yet" description="Add the first line to price this order." />
      ) : (
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr>
              <th className="w-8 py-2xs text-left">
                {!readOnly && (
                  <Checkbox
                    aria-label="Select all lots"
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                  />
                )}
              </th>
              {head.map((column, index) => (
                <th
                  key={column}
                  className={cn(
                    'py-2xs text-small font-medium text-muted-foreground',
                    index === 0 && 'text-left',
                    index === head.length - 1 && 'text-right',
                    index > 0 && index < head.length - 1 && 'text-center'
                  )}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lots.map((lot) => (
              <LotRow
                key={lot.id}
                kind={kind}
                lot={lot}
                readOnly={readOnly}
                selected={selected.includes(lot.id)}
                onSelect={() => toggle(lot.id)}
                onEdit={(patch) => onEdit(lot.id, patch)}
              />
            ))}
          </tbody>
        </table>
      )}
    </OrderCard>
  )
}

function AddingLot({ search }: { search: NonNullable<LotsCardProps['search']> }) {
  return (
    <div className="flex w-full items-end gap-xs lg:w-[420px]">
      <Autocomplete
        value={search.value}
        onValueChange={search.onValueChange}
        items={search.items}
        onSelect={search.onSelect}
        placeholder="Search lots…"
        empty="No lot matches that."
        className="flex-1"
      />
      <Button
        variant={search.chosen ? 'primary' : 'secondary'}
        disabled={!search.chosen}
        onClick={search.onAdd}
      >
        Add to Order
      </Button>
    </div>
  )
}

function LotRow({
  kind,
  lot,
  readOnly,
  selected,
  onSelect,
  onEdit,
}: {
  kind: LotsKind
  lot: OrderLotView
  readOnly: boolean
  selected: boolean
  onSelect: () => void
  onEdit: (patch: OrderLotPatch) => void
}) {
  const name = lot.lot.product_name ?? lot.lot.metal_id
  const cells: React.ReactNode[] =
    kind === 'scrap'
      ? [
          <Cell
            key="qty"
            value={lot.lot.quantity}
            readOnly={readOnly}
            onCommit={(quantity) => onEdit({ quantity })}
          />,
          <Cell
            key="pre"
            value={lot.lot.pre_melt}
            readOnly={readOnly}
            onCommit={(pre_melt) => onEdit({ pre_melt })}
          />,
          <Cell
            key="post"
            value={lot.lot.post_melt}
            readOnly={readOnly}
            onCommit={(post_melt) => onEdit({ post_melt })}
          />,
          <Cell
            key="purity"
            value={lot.lot.purity}
            readOnly={readOnly}
            display={percent(lot.lot.purity)}
            onCommit={(purity) => onEdit({ purity })}
          />,
          <Cell
            key="premium"
            value={lot.premium}
            readOnly={readOnly}
            display={asPremium(lot.premium)}
            onCommit={(premium) => onEdit({ premium })}
          />,
        ]
      : [
          <Cell
            key="qty"
            value={lot.lot.quantity}
            readOnly={readOnly}
            onCommit={(quantity) => onEdit({ quantity })}
          />,
          <Cell
            key="premium"
            value={lot.premium}
            readOnly={readOnly}
            display={asPremium(lot.premium)}
            onCommit={(premium) => onEdit({ premium })}
          />,
        ]

  return (
    <tr data-selected={selected || undefined} className="border-t border-border">
      <td className="py-xs align-middle">
        {!readOnly && (
          <Checkbox aria-label={`Select ${name}`} checked={selected} onCheckedChange={onSelect} />
        )}
      </td>
      <td className="py-xs pr-sm align-middle">
        <p className="truncate text-small font-medium text-foreground">{name}</p>
        <p className="truncate text-micro text-muted-foreground">{lot.lot.form ?? DASH}</p>
      </td>
      <td className="py-xs text-center align-middle">
        <Link href={`/admin/lots/${lot.lot_id}`}>{lot.lot.reference ?? DASH}</Link>
      </td>
      {cells.map((cell) => (
        <td key={(cell as React.ReactElement).key} className="px-3xs py-xs align-middle">
          {cell}
        </td>
      ))}
      <td className="py-xs pl-sm text-right align-middle text-small font-medium text-foreground">
        {money(lot.line_total)}
      </td>
    </tr>
  )
}

function Cell({
  value,
  readOnly,
  display,
  onCommit,
}: {
  value: number | null
  readOnly: boolean
  display?: string
  onCommit: (next: number) => void
}) {
  const asText = value === null ? '' : String(value)
  const [draft, setDraft] = React.useState(asText)
  React.useEffect(() => setDraft(asText), [asText])

  if (readOnly) {
    return <p className="text-center text-small text-foreground">{display ?? plain(value)}</p>
  }

  return (
    <Input
      type="number"
      inputMode="decimal"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = Number(draft)
        if (!Number.isFinite(next) || next === value) return
        onCommit(next)
      }}
      inputClassName="text-center"
    />
  )
}
