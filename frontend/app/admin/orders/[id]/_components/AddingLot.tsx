'use client'

import * as React from 'react'
import { Autocomplete, Button, Select, type SelectItemShape } from '@dorado/components'
import { Check, Search, X } from '@dorado/icons'
import type { InventoryLotView, OrderLotPatch } from '@dorado/contracts'

import { formatWeight } from '../../_lib'
import { WEIGHT_LABELS, formatDecimal, percentToRatio } from '../_lib'
import { DecimalField } from './DecimalField'

type StockProps = {
  mode: 'stock'
  query: string
  onQueryChange: (query: string) => void
  results: readonly InventoryLotView[]
  onAdd: (lotId: string) => void
}

type DeclareProps = {
  mode: 'declare'
  metals: readonly SelectItemShape[]
  onAdd: (lot: OrderLotPatch) => void
}

export type AddingLotProps = (StockProps | DeclareProps) & {
  enabled: boolean
  pending?: boolean
  onCancel?: () => void
}

const describe = (lot: InventoryLotView): string =>
  [
    lot.reference,
    lot.product_name ?? lot.metal_id,
    formatWeight(lot.post_melt ?? lot.pre_melt, lot.unit),
    lot.order_reference,
  ]
    .filter((part) => part != null && part !== '')
    .join(' · ')

function FromStock({
  query,
  onQueryChange,
  results,
  onAdd,
  enabled,
  pending,
  onCancel,
}: StockProps & AddingLotProps) {
  const [chosen, setChosen] = React.useState<string | null>(null)
  return (
    <>
      <Autocomplete
        className="w-[460px] max-w-full"
        value={query}
        onValueChange={(next) => {
          setChosen(null)
          onQueryChange(next)
        }}
        placeholder="Search by lot #, metal or customer…"
        leading={<Search aria-hidden />}
        trailing={
          query.length > 0 || onCancel ? (
            <Button
              variant="tertiary"
              size="iconInline"
              aria-label="Clear search"
              onClick={() => {
                setChosen(null)
                onQueryChange('')
                if (query.length === 0) onCancel?.()
              }}
            >
              <X aria-hidden />
            </Button>
          ) : undefined
        }
        items={results.map((lot) => ({
          id: lot.id,
          textValue: describe(lot),
          label: (
            <span className="flex w-full items-center justify-between gap-xs">
              {describe(lot)}
              {chosen === lot.id && <Check aria-hidden className="size-4" />}
            </span>
          ),
        }))}
        empty="No lots match"
        onSelect={(item) => {
          setChosen(item.id)
          onQueryChange(item.textValue)
        }}
        inputProps={{ 'aria-label': 'Find lot' }}
      />
      <Button
        variant="secondary"
        size="sm"
        disabled={!enabled || pending || chosen == null}
        onClick={() => chosen && onAdd(chosen)}
      >
        Add to Order
      </Button>
    </>
  )
}

function Declare({ metals, onAdd, enabled, pending }: DeclareProps & AddingLotProps) {
  const [metal, setMetal] = React.useState<string | undefined>(undefined)
  const [gross, setGross] = React.useState<number | null>(null)
  const [purity, setPurity] = React.useState<number | null>(null)
  return (
    <>
      <Select
        className="w-36"
        placeholder="Metal"
        items={[...metals]}
        value={metal}
        onValueChange={setMetal}
      />
      <DecimalField
        className="w-[110px]"
        ariaLabel={`${WEIGHT_LABELS.gross} weight`}
        value={gross}
        format={formatDecimal}
        unit="g"
        onCommit={setGross}
      />
      <DecimalField
        className="w-[94px]"
        ariaLabel="Purity"
        value={purity}
        format={formatDecimal}
        unit="%"
        onCommit={setPurity}
      />
      <Button
        variant="secondary"
        size="sm"
        disabled={!enabled || pending || metal == null || gross == null}
        onClick={() =>
          metal != null &&
          onAdd({
            metal_id: metal,
            unit: 'g',
            quantity: 1,
            pre_melt: gross,
            purity: percentToRatio(purity),
          })
        }
      >
        Add to Order
      </Button>
    </>
  )
}

export function AddingLot(props: AddingLotProps) {
  return (
    <span data-mode={props.mode} className="flex flex-wrap items-center justify-end gap-xs">
      {props.mode === 'stock' ? <FromStock {...props} /> : <Declare {...props} />}
    </span>
  )
}
