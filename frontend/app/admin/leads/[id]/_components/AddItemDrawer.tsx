'use client'

import * as React from 'react'
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Input,
  RadioGroup,
  RadioOption,
  Text,
} from '@dorado/components'
import type {
  EstimateItemPatch,
  LeadLookup,
  PurityLookup,
  WeightUnitLookup,
} from '@dorado/contracts'

import { unitShort } from '../../_lib'

export type AddItemDrawerProps = {
  open: boolean
  setOpen: (open: boolean) => void
  layout?: 'desktop' | 'mobile'
  kinds: LeadLookup[]
  units: WeightUnitLookup[]
  purities: PurityLookup[]
  pending?: boolean
  onAdd: (item: EstimateItemPatch) => void
}

function ChipGroup({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string
  value: string
  onValueChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <RadioGroup
      aria-label={label}
      orientation="horizontal"
      value={value}
      onValueChange={onValueChange}
      className="grid grid-cols-4 gap-xs"
    >
      {options.map((option) => (
        <RadioOption key={option.value} variant="chip" value={option.value}>
          {option.label}
        </RadioOption>
      ))}
    </RadioGroup>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-xs">
      <Text variant="micro" className="text-muted-foreground">
        {title}
      </Text>
      {children}
    </div>
  )
}

export function AddItemDrawer({
  open,
  setOpen,
  layout = 'desktop',
  kinds,
  units,
  purities,
  pending = false,
  onAdd,
}: AddItemDrawerProps) {
  const metals = React.useMemo(
    () => Array.from(new Set(purities.map((row) => row.metal_id))),
    [purities]
  )
  const [kind, setKind] = React.useState('')
  const [metal, setMetal] = React.useState('')
  const [purityId, setPurityId] = React.useState('')
  const [typedPurity, setTypedPurity] = React.useState('')
  const [weight, setWeight] = React.useState('')
  const [unit, setUnit] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    setKind(kinds.find((row) => row.key === 'scrap')?.id ?? kinds[0]?.id ?? '')
    setMetal(metals[0] ?? '')
    setUnit(units.find((row) => row.key === 'g')?.id ?? units[0]?.id ?? '')
    setPurityId('')
    setTypedPurity('')
    setWeight('')
  }, [open, kinds, metals, units])

  const offered = purities.filter((row) => row.metal_id === metal)
  const unitKey = units.find((row) => row.id === unit)?.key ?? ''
  const amount = Number(weight)
  const typed = Number(typedPurity)
  const hasTyped = typedPurity.trim() !== '' && typed > 0 && typed <= 100
  const ready =
    kind !== '' &&
    metal !== '' &&
    unit !== '' &&
    weight.trim() !== '' &&
    amount > 0 &&
    (purityId !== '' || hasTyped)

  const submit = () => {
    if (!ready || pending) return
    onAdd({
      kind_id: kind,
      metal_id: metal,
      ...(purityId !== '' ? { purity_id: purityId } : { custom_purity: typed / 100 }),
      weight: amount,
      unit_id: unit,
    })
  }

  return (
    <Drawer
      open={open}
      setOpen={setOpen}
      size={layout === 'mobile' ? 'full' : 'sm'}
      label="Add item"
    >
      <DrawerHeader title="Add item" />
      <DrawerBody>
        <div className="flex flex-col gap-md">
          <Group title="Type">
            <ChipGroup
              label="Type"
              value={kind}
              onValueChange={setKind}
              options={kinds.map((row) => ({ value: row.id, label: row.label }))}
            />
          </Group>
          <Group title="Metal">
            <ChipGroup
              label="Metal"
              value={metal}
              onValueChange={(next) => {
                setMetal(next)
                setPurityId('')
              }}
              options={metals.map((id) => ({ value: id, label: id }))}
            />
          </Group>
          <div className="flex flex-col gap-xs">
            <Input
              label="Purity"
              inputMode="decimal"
              trailing="%"
              value={typedPurity}
              onChange={(event) => {
                setTypedPurity(event.target.value)
                setPurityId('')
              }}
            />
            <ChipGroup
              label="Karat or fineness"
              value={purityId}
              onValueChange={(next) => {
                setPurityId(next)
                setTypedPurity('')
              }}
              options={offered.map((row) => ({ value: row.id, label: row.label }))}
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Input
              label="Weight"
              inputMode="decimal"
              trailing={unitShort(unitKey)}
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
            />
            <ChipGroup
              label="Unit"
              value={unit}
              onValueChange={setUnit}
              options={units.map((row) => ({ value: row.id, label: row.label }))}
            />
          </div>
        </div>
      </DrawerBody>
      <DrawerFooter>
        <Button disabled={pending} aria-busy={pending || undefined} onClick={submit}>
          Add to estimate
        </Button>
      </DrawerFooter>
    </Drawer>
  )
}
