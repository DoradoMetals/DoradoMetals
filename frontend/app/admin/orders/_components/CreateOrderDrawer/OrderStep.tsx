'use client'

import * as React from 'react'
import { Alert, Autocomplete, Button, RadioGroup, Select, Text } from '@dorado/components'
import { Building2, Plus, Search, User } from '@dorado/icons'
import { useAdminUser, useEmployees, useLocations, useRefiners, useSearch } from '@dorado/client'
import type { OrderPreview, RefiningOrderRead } from '@dorado/contracts'

import {
  copyLotRow,
  emptyDrawerState,
  isRefiner,
  lotOf,
  newLotRow,
  type DrawerState,
  type OrderKind,
} from '../../_lib/createOrder'
import { KIND_TILES, SETTLEMENT_TYPES, formatMoney, lotsWord } from '../../_lib/createOrderView'
import { Section, Tile } from './parts'
import { LotRowCard } from './LotRowCard'
import { OnHandLots } from './OnHandLots'
import type { DrawerViewer } from './index'

export function OrderStep({
  state,
  update,
  viewer,
  locked,
  preview,
  openSale,
}: {
  state: DrawerState
  update: (patch: Partial<DrawerState>) => void
  viewer: DrawerViewer
  locked: { kind?: boolean; customer?: boolean }
  preview: OrderPreview | null
  openSale: RefiningOrderRead | null
}) {
  const chooseKind = (kind: string) => {
    const next = emptyDrawerState(kind as OrderKind)
    update({
      ...next,
      customer_id: state.customer_id,
      assigned_to_id: state.assigned_to_id,
    })
  }

  return (
    <>
      <Section title="What kind of order?">
        <RadioGroup
          value={state.kind}
          onValueChange={chooseKind}
          disabled={locked.kind}
          className="grid grid-cols-1 gap-xs sm:grid-cols-2"
        >
          {KIND_TILES.map((tile) => (
            <Tile
              key={tile.kind}
              value={tile.kind}
              title={tile.title}
              description={tile.description}
              disabled={locked.kind}
              icon={
                isRefiner(tile.kind) ? (
                  <Building2 aria-hidden className="size-4" />
                ) : (
                  <User aria-hidden className="size-4" />
                )
              }
            />
          ))}
        </RadioGroup>
      </Section>
      <Section title={isRefiner(state.kind) ? 'Which refiner?' : 'Who is it for?'}>
        {isRefiner(state.kind) ? (
          <RefinerParty state={state} update={update} openSale={openSale} />
        ) : (
          <CustomerField state={state} update={update} locked={!!locked.customer} />
        )}
        <AssigneeField state={state} update={update} viewer={viewer} />
      </Section>
      {state.kind === 'refiner_sale' && (
        <Section title="Lots">
          <OnHandLots state={state} update={update} preview={preview} />
        </Section>
      )}
      {!isRefiner(state.kind) && <CustomerLots state={state} update={update} preview={preview} />}
    </>
  )
}

function CustomerField({
  state,
  update,
  locked,
}: {
  state: DrawerState
  update: (patch: Partial<DrawerState>) => void
  locked: boolean
}) {
  const [query, setQuery] = React.useState<string | null>(null)
  const customer = useAdminUser(state.customer_id).data
  const hits = useSearch(query ?? '', { enabled: query !== null }).data ?? []
  const items = hits
    .filter((hit) => hit.kind === 'customer')
    .map((hit) => ({ id: hit.id, textValue: hit.title }))

  return (
    <Autocomplete
      label="Customer"
      placeholder="Search name, phone or email"
      leading={<Search aria-hidden />}
      value={query ?? customer?.name ?? ''}
      onValueChange={setQuery}
      items={items}
      disabled={locked}
      empty="No customer matches"
      onSelect={(item) => {
        setQuery(item.textValue)
        update({ customer_id: item.id, payout: null, recipient_address_id: null })
      }}
    />
  )
}

function AssigneeField({
  state,
  update,
  viewer,
}: {
  state: DrawerState
  update: (patch: Partial<DrawerState>) => void
  viewer: DrawerViewer
}) {
  const employees = useEmployees().data ?? []
  const items = employees
    .filter((employee) => employee.enabled)
    .map((employee) => ({ value: employee.user_id, label: employee.name ?? 'Unnamed' }))
  if (!items.some((item) => item.value === viewer.id)) {
    items.push({ value: viewer.id, label: viewer.name })
  }
  const employee = viewer.role === 'employee'
  return (
    <Select
      label="Assigned to"
      placeholder="Auto-assign"
      items={items}
      value={(employee ? viewer.id : state.assigned_to_id) ?? undefined}
      onValueChange={(value) => update({ assigned_to_id: value })}
      disabled={employee}
    />
  )
}

function RefinerParty({
  state,
  update,
  openSale,
}: {
  state: DrawerState
  update: (patch: Partial<DrawerState>) => void
  openSale: RefiningOrderRead | null
}) {
  const refiners = useRefiners().data ?? []
  const locations = useLocations().data ?? []
  const refiner = refiners.find((row) => row.id === state.refiner_id)
  return (
    <>
      <Select
        label="Refiner"
        placeholder="Choose a refiner"
        items={refiners.map((row) => ({ value: row.id, label: row.organization.name }))}
        value={state.refiner_id ?? undefined}
        onValueChange={(value) => update({ refiner_id: value, lot_ids: [], fulfillment: null })}
      />
      {openSale && (
        <Alert
          intent="warning"
          title={`${refiner?.organization.name ?? 'This refiner'} already has an open sell order`}
        >
          {`${openSale.number} is still open. Add the lots to it from the refiner screen.`}
        </Alert>
      )}
      <Select
        label="Settlement type"
        placeholder="Choose a settlement type"
        items={SETTLEMENT_TYPES}
        value={state.settlement_type ?? undefined}
        onValueChange={(value) => update({ settlement_type: value })}
      />
      <Select
        label="Location"
        placeholder="Choose a location"
        items={locations.map((row) => ({ value: row.id, label: row.name }))}
        value={state.location_id ?? undefined}
        onValueChange={(value) => update({ location_id: value })}
      />
    </>
  )
}

function CustomerLots({
  state,
  update,
  preview,
}: {
  state: DrawerState
  update: (patch: Partial<DrawerState>) => void
  preview: OrderPreview | null
}) {
  const sale = state.kind === 'customer_sale'
  const positions = React.useMemo(() => {
    let position = 0
    return state.lots.map((row) => (lotOf(row) === null ? null : position++))
  }, [state.lots])

  const setRows = (lots: DrawerState['lots']) => update({ lots })

  return (
    <Section title="Lots">
      {state.lots.length === 0 && (
        <Text variant="micro" className="text-muted-foreground">
          No lots yet. The order can be created with no lots; add them on the order screen later.
        </Text>
      )}
      {state.lots.map((row, index) => (
        <LotRowCard
          key={row.key}
          index={index}
          row={row}
          sale={sale}
          line={
            positions[index] === null
              ? null
              : (preview?.lines.find((line) => line.position === positions[index]) ?? null)
          }
          onChange={(next) => setRows(state.lots.map((r, i) => (i === index ? next : r)))}
          onDuplicate={() => {
            const rows = [...state.lots]
            rows.splice(index + 1, 0, copyLotRow(row))
            setRows(rows)
          }}
          onRemove={() => setRows(state.lots.filter((_, i) => i !== index))}
        />
      ))}
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <Button
          variant="secondary"
          size="sm"
          icon={Plus}
          onClick={() => setRows([...state.lots, newLotRow(sale ? 'bullion' : 'scrap')])}
        >
          Add lot
        </Button>
        <span className="flex items-center gap-xs">
          <Text variant="micro" className="text-muted-foreground">
            {`Order estimate · ${lotsWord(state.lots.length)}`}
          </Text>
          <Text variant="small-medium">{formatMoney(preview?.total ?? 0)}</Text>
        </span>
      </div>
    </Section>
  )
}
