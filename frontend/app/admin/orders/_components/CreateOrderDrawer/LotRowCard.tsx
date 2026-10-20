'use client'

import * as React from 'react'
import { Autocomplete, Button, Card, Input, RadioGroup, Select, Text } from '@dorado/components'
import { FilePlus, Search, Trash2 } from '@dorado/icons'
import { useAdminProducts } from '@dorado/client'
import type { OrderPreviewLine } from '@dorado/contracts'

import { percentOf, type LotForm, type LotRow } from '../../_lib/createOrder'
import { METALS, PURITIES, UNITS, formatMoney, formatOz } from '../../_lib/createOrderView'
import { Chip } from './parts'

export function LotRowCard({
  index,
  row,
  sale,
  line,
  onChange,
  onDuplicate,
  onRemove,
}: {
  index: number
  row: LotRow
  sale: boolean
  line: OrderPreviewLine | null
  onChange: (row: LotRow) => void
  onDuplicate: () => void
  onRemove: () => void
}) {
  const number = index + 1
  const set = (patch: Partial<LotRow>) => onChange({ ...row, ...patch })
  const premium = row.premium ?? (line ? percentOf(line.premium) : '')
  const purities =
    PURITIES.some((p) => p.value === row.purity) || !row.purity
      ? PURITIES
      : [...PURITIES, { value: row.purity, label: `${percentOf(Number(row.purity))}%` }]

  return (
    <Card className="gap-sm">
      <div className="flex items-center justify-between gap-sm">
        <div className="flex items-center gap-xs">
          <Text variant="small-medium">{`Lot ${number}`}</Text>
          {!sale && (
            <RadioGroup
              value={row.form}
              onValueChange={(form) =>
                set({ form: form as LotForm, unit: form === 'scrap' ? row.unit || 'g' : row.unit })
              }
              className="flex gap-2xs"
            >
              <Chip value="scrap" label="Scrap" />
              <Chip value="bullion" label="Bullion" />
            </RadioGroup>
          )}
        </div>
        <div className="flex items-center gap-2xs">
          <Button
            variant="tertiary"
            size="iconXs"
            aria-label={`Duplicate lot ${number}`}
            onClick={onDuplicate}
          >
            <FilePlus aria-hidden />
          </Button>
          <Button
            variant="tertiary"
            intent="danger"
            size="iconXs"
            aria-label={`Remove lot ${number}`}
            onClick={onRemove}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>
      {row.form === 'scrap' ? (
        <div className="grid grid-cols-2 gap-xs sm:grid-cols-5">
          <Select
            label="Metal"
            placeholder="Metal"
            items={METALS.map((metal) => ({ value: metal, label: metal }))}
            value={row.metal_id ?? undefined}
            onValueChange={(metal_id) => set({ metal_id })}
          />
          <Input
            label="Gross weight"
            inputMode="decimal"
            value={row.pre_melt}
            onChange={(e) => set({ pre_melt: e.target.value })}
          />
          <Select
            label="Unit"
            placeholder="Unit"
            items={UNITS}
            value={row.unit || undefined}
            onValueChange={(unit) => set({ unit })}
          />
          <Select
            label="Purity"
            placeholder="Purity"
            items={purities}
            value={row.purity || undefined}
            onValueChange={(purity) => set({ purity })}
          />
          <Input
            label="Premium (% of spot)"
            inputMode="decimal"
            trailing="%"
            value={premium}
            onChange={(e) => set({ premium: e.target.value })}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-xs sm:grid-cols-[2fr_1fr_1fr]">
          <ProductField row={row} onPick={(bullion_id) => set({ bullion_id })} />
          <Input
            label="Quantity"
            inputMode="numeric"
            value={row.quantity}
            onChange={(e) => set({ quantity: e.target.value })}
          />
          <Input
            label="Premium (% of spot)"
            inputMode="decimal"
            trailing="%"
            value={premium}
            onChange={(e) => set({ premium: e.target.value })}
          />
        </div>
      )}
      <div className="flex items-center justify-between gap-sm">
        <Text variant="micro" className="text-muted-foreground">
          {line
            ? `Lot estimate · ${formatOz(line.fine_oz)}`
            : 'Lot estimate · complete the lot to price it'}
        </Text>
        {line && <Text variant="small-medium">{formatMoney(line.total)}</Text>}
      </div>
    </Card>
  )
}

function ProductField({ row, onPick }: { row: LotRow; onPick: (bullion_id: string) => void }) {
  const products = useAdminProducts().data ?? []
  const [query, setQuery] = React.useState<string | null>(null)
  const chosen = products.find((product) => product.id === row.bullion_id)
  const needle = (query ?? '').toLowerCase()
  const items = products
    .filter((product) => query === null || product.name.toLowerCase().includes(needle))
    .slice(0, 20)
    .map((product) => ({ id: product.id, textValue: product.name }))
  return (
    <Autocomplete
      label="Product"
      placeholder="Search products"
      leading={<Search aria-hidden />}
      value={query ?? chosen?.name ?? ''}
      onValueChange={setQuery}
      items={items}
      empty="No product matches"
      onSelect={(item) => {
        setQuery(null)
        onPick(item.id)
      }}
    />
  )
}
