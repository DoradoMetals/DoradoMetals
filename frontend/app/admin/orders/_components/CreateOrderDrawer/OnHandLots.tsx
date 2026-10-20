'use client'

import * as React from 'react'
import {
  Card,
  Checkbox,
  EmptyState,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@dorado/components'
import { Package, Search } from '@dorado/icons'
import { useOnHandLots } from '@dorado/client'
import type { OrderPreview } from '@dorado/contracts'

import type { DrawerState } from '../../_lib/createOrder'
import { METALS, formatMoney } from '../../_lib/createOrderView'
import { formatPurity, formatWeight } from '../../_lib/format'

const ALL = 'all'

export function OnHandLots({
  state,
  update,
  preview,
}: {
  state: DrawerState
  update: (patch: Partial<DrawerState>) => void
  preview: OrderPreview | null
}) {
  const [metal, setMetal] = React.useState(ALL)
  const [q, setQ] = React.useState('')
  const lots = useOnHandLots({ metal_id: metal === ALL ? null : metal, q }).data ?? []
  const chosen = new Set(state.lot_ids)
  const totalOf = (id: string) => preview?.lines.find((line) => line.lot_id === id)?.total

  const toggle = (id: string, on: boolean) =>
    update({
      lot_ids: on
        ? [...state.lot_ids.filter((x) => x !== id), id]
        : state.lot_ids.filter((x) => x !== id),
    })

  return (
    <div className="flex flex-col gap-sm">
      <div className="grid grid-cols-1 gap-xs sm:grid-cols-[1fr_12rem]">
        <Input
          aria-label="Lot number"
          placeholder="Lot number"
          leading={<Search aria-hidden />}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select
          label="Metal"
          items={[
            { value: ALL, label: 'All metals' },
            ...METALS.map((m) => ({ value: m, label: m })),
          ]}
          value={metal}
          onValueChange={setMetal}
        />
      </div>
      <Card className="gap-xs">
        <div className="flex items-center justify-between">
          <Text variant="small-medium">On-hand lots</Text>
          <Text variant="micro" className="text-muted-foreground">
            {`${state.lot_ids.length} selected`}
          </Text>
        </div>
        {lots.length === 0 ? (
          <EmptyState
            icon={<Package aria-hidden />}
            title="No on-hand lots"
            description="A refiner sale may be created empty; lots are added on the order screen later."
          />
        ) : (
          <Table bare>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Checkbox
                    aria-label="Select every lot"
                    checked={lots.every((lot) => chosen.has(lot.id))}
                    onCheckedChange={(on) =>
                      update({
                        lot_ids: on
                          ? [...new Set([...state.lot_ids, ...lots.map((lot) => lot.id)])]
                          : state.lot_ids.filter((id) => !lots.some((lot) => lot.id === id)),
                      })
                    }
                  />
                </TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Post melt</TableHead>
                <TableHead>Purity</TableHead>
                <TableHead>Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lots.map((lot) => {
                const name = lot.product_name ?? `${lot.metal_id} lot`
                const total = totalOf(lot.id)
                return (
                  <TableRow key={lot.id}>
                    <TableCell>
                      <Checkbox
                        aria-label={`${name}, lot ${lot.reference ?? ''}`}
                        checked={chosen.has(lot.id)}
                        onCheckedChange={(on) => toggle(lot.id, on === true)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-small font-medium">{name}</span>
                        <span className="text-micro text-muted-foreground">{`Lot ${lot.reference ?? ''}`}</span>
                      </div>
                    </TableCell>
                    <TableCell>{lot.order_reference ?? '—'}</TableCell>
                    <TableCell>{formatWeight(lot.post_melt, lot.unit) ?? '—'}</TableCell>
                    <TableCell>{formatPurity(lot.purity) ?? '—'}</TableCell>
                    <TableCell>{total === undefined ? '—' : formatMoney(total)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
