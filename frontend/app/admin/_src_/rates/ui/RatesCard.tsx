'use client'

import type { AdminRate } from "@dorado/contracts";
import * as React from 'react'
import { Button, Input } from '@dorado/components'
import { Pencil, Save, X } from '@dorado/icons'
import { cn } from '@/shared/utils/cn'
import { getBoundsForMetal, sortRatesByMin, pctToInt, intToPct, labelFor } from '@/shared/types/rates'
import { DualRangeSlider } from './DualRangeSlider'
import { useCreateRate, useDeleteRate, useUpdateRate } from '../queries'

export default function RatesCard({
  metal,
  rates,
  className,
}: {
  metal: string
  rates: AdminRate[]
  className?: string
}) {
  const [editing, setEditing] = React.useState(false)
  const unit = rates[0]?.unit ?? 'troy_oz'
  const { cap, step } = getBoundsForMetal(metal)

  // THE READ'S DATA IS THE STATE. Two effects used to copy `rates` into
  // `items` - one when edit mode opened, one whenever the read landed - so the
  // card held a duplicate of rows it was already looking at, and a refetch
  // overwrote them. `draft` exists only while an edit is uncommitted, which is
  // the one thing the server does not know.
  const [draft, setDraft] = React.useState<AdminRate[] | null>(null)
  const [dirtyIds, setDirtyIds] = React.useState<Set<string>>(new Set())
  const items = draft ?? sortRatesByMin(rates)

  const setItems = (next: AdminRate[] | ((prev: AdminRate[]) => AdminRate[])) =>
    setDraft((prev) =>
      typeof next === 'function' ? next(prev ?? sortRatesByMin(rates)) : next
    )

  const stopEditing = () => {
    setDraft(null)
    setDirtyIds(new Set())
    setEditing(false)
  }

  const update = useUpdateRate()
  const create = useCreateRate()
  const del = useDeleteRate()

  function patchLocal(id: string, patch: Partial<AdminRate>) {
    setItems((prev) => {
      const next = prev.map((r) => (r.id === id ? ({ ...r, ...patch } as AdminRate) : r))
      return sortRatesByMin(next)
    })
    setDirtyIds((s) => new Set(s).add(id))
  }

  const onSaveAll = () => {
    const dirty = items.filter((r) => dirtyIds.has(r.id))
    for (const r of dirty) {
      update.mutate({
        id: r.id,
        patch: {
          metal_id: r.metal_id,
          unit: r.unit,
          min_qty: r.min_qty,
          max_qty: r.max_qty,
          scrap_pct: r.scrap_pct,
          bullion_pct: r.bullion_pct,
        },
      })
    }
    stopEditing()
  }

  return (
    <div className={cn('rounded-lg p-4 bg-card border border-border', className)}>
      <Header
        metal={metal}
        editing={editing}
        onCancel={stopEditing}
        onSaveAll={onSaveAll}
        onEdit={() => {
          setDraft(sortRatesByMin(rates))
          setDirtyIds(new Set())
          setEditing(true)
        }}
      />

      {!editing ? (
        <ReadView unit={unit} rows={items} />
      ) : (
        <EditView
          unit={unit}
          rows={items}
          cap={cap}
          step={step}
          onRangeChange={(id, min_qty, max_qty) => patchLocal(id, { min_qty, max_qty })}
          onScrapChange={(id, v) => patchLocal(id, { scrap_pct: intToPct(v) })}
          onBullChange={(id, v) => patchLocal(id, { bullion_pct: intToPct(v) })}
          onDelete={(row) => del.mutate(row.id)}
          onAdd={() => {
            const last = items.at(-1)
            if (last && last.max_qty == null) {
              patchLocal(last.id, { max_qty: cap })
            }
            const startAt = items.at(-1)?.max_qty ?? 0
            const template = {
              metal_id: items[0]?.metal_id ?? rates[0]?.metal_id ?? '',
              unit,
              min_qty: startAt,
              max_qty: null as number | null,
              scrap_pct: 0.85,
              bullion_pct: 0.85,
            }
            create.mutate(template as any)
          }}
          dirtyIds={dirtyIds}
        />
      )}
    </div>
  )
}

function Header({
  metal,
  editing,
  onEdit,
  onCancel,
  onSaveAll,
}: {
  metal: string
  editing: boolean
  onEdit: () => void
  onCancel: () => void
  onSaveAll: () => void
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3>{metal}</h3>
      {!editing ? (
        <Button size="sm" variant="tertiary" onClick={onEdit} className="gap-1">
          <Pencil size={20} />
          Edit
        </Button>
      ) : (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="tertiary" onClick={onCancel} className="gap-1">
            <X size={20} />
            Cancel
          </Button>
          <Button size="sm" className="gap-1" onClick={onSaveAll}>
            <Save size={20} />
            Save
          </Button>
        </div>
      )}
    </div>
  )
}

function ReadView({ unit, rows }: { unit: string; rows: AdminRate[] }) {
  const u = unit === 'troy_oz' ? 'oz' : unit
  return (
    <div className="border rounded-lg p-4 bg-muted/50">
      <div className="flex items-center px-1 mb-4">
        <p className="basis-0 grow-[2] text-left eyebrow">Range (oz)</p>
        <p className="basis-0 grow text-center eyebrow">Scrap</p>
        <p className="basis-0 grow text-center eyebrow">Bullion</p>
      </div>

      <div className="mt-2 space-y-6">
        {rows.map((r) => (
          <div key={r.id} className="flex items-end px-1">
            <p className="basis-0 grow-[2] tabular-nums">
              {r.max_qty == null ? `${r.min_qty}+ ${u}` : `${r.min_qty}–${r.max_qty} ${u}`}
            </p>
            <strong className="stat-sm basis-0 grow text-center">
              {Math.round((r.scrap_pct ?? 0) * 100)}%
            </strong>
            <strong className="stat-sm basis-0 grow text-center">
              {Math.round((r.bullion_pct ?? 0) * 100)}%
            </strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function EditView({
  unit,
  rows,
  cap,
  step,
  onRangeChange,
  onScrapChange,
  onBullChange,
  onDelete,
  onAdd,
  dirtyIds,
}: {
  unit: string
  rows: AdminRate[]
  cap: number
  step: number
  onRangeChange: (id: string, min: number, max: number | null) => void
  onScrapChange: (id: string, pctInt: number) => void
  onBullChange: (id: string, pctInt: number) => void
  onDelete: (row: AdminRate) => void
  onAdd: () => void
  dirtyIds: Set<string>
}) {
  const u = unit === 'troy_oz' ? 'oz' : unit

  return (
    <div className="border rounded-lg p-4 bg-background">
      <div className="flex items-center px-1 mb-4">
        <p className="basis-0 grow-[2] text-left eyebrow">Range (oz)</p>
        <p className="basis-0 grow text-center eyebrow">Scrap</p>
        <p className="basis-0 grow text-center eyebrow">Bullion</p>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((r, i) => {
          const prev = rows[i - 1]
          const next = rows[i + 1]
          const minBound = prev ? prev.max_qty ?? 0 : 0
          const maxBound = next ? next.min_qty : cap

          const current: [number, number] = [
            Math.max(minBound, r.min_qty),
            r.max_qty == null ? cap : Math.min(maxBound, r.max_qty),
          ]

          return (
            <div key={r.id} className="flex items-center gap-1 px-1">
              <div className="basis-0 grow-[2] flex items-center">
                <div className="relative w-full py-4">
                  <DualRangeSlider
                    min={0}
                    max={cap}
                    step={step}
                    value={current}
                    onValueChange={([minV, maxV]: number[]) => {
                      const clampedMin = Math.max(minBound, Math.min(minV, maxV))
                      const clampedMax = Math.min(maxBound, Math.max(maxV, clampedMin))
                      onRangeChange(r.id, clampedMin, clampedMax >= cap ? null : clampedMax)
                    }}
                    label={() => null}
                    className="w-full"
                  />
                  <MergedRangeLabels min={current[0]} max={r.max_qty} cap={cap} />
                </div>
              </div>

              <div className="basis-0 grow flex items-center justify-center">
                <PercentBox
                  value={pctToInt(r.scrap_pct)}
                  onChange={(p) => onScrapChange(r.id, p)}
                  isDirty={dirtyIds.has(r.id)}
                />
              </div>

              <div className="basis-0 grow flex items-center justify-center">
                <PercentBox
                  value={pctToInt(r.bullion_pct)}
                  onChange={(p) => onBullChange(r.id, p)}
                  isDirty={dirtyIds.has(r.id)}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex justify-between items-center">
        <small>
          Units: <strong>{u}</strong>
        </small>
        <Button size="sm" variant="secondary" className="gap-1" type="button" onClick={onAdd}>
          + Add Band
        </Button>
      </div>
    </div>
  )
}

function PercentBox({
  value,
  onChange,
  isDirty,
}: {
  value: number
  onChange: (p: number) => void
  isDirty?: boolean
}) {
  return (
    /* The unsaved-edit ring lives on PercentBox, not on the Input's className:
       Input has no "dirty" state variant and ruling 20 keeps appearance out of
       a shared component's call site. Reported as a missing Input state. */
    <div className={cn('flex items-center gap-1 rounded-md', isDirty && 'ring-2 ring-primary/60')}>
      <Input
        className="w-16"
        inputClassName="text-center"
        inputMode="decimal"
        type="number"
        value={value}
        onChange={(e) => onChange(e.currentTarget.valueAsNumber || 0)}
      />
    </div>
  )
}

function MergedRangeLabels({
  min,
  max,
  cap,
  thresholdPct = 25,
}: {
  min: number
  max: number | null
  cap: number
  thresholdPct?: number
}) {
  const minPct = Math.max(0, Math.min(100, (min / cap) * 100))
  const maxVal = max == null || max >= cap ? cap : max
  const maxPct = Math.max(0, Math.min(100, (maxVal / cap) * 100))

  const close = Math.abs(maxPct - minPct) <= thresholdPct

  const clampPct = (p: number, padPct: number) => Math.max(padPct, Math.min(100 - padPct, p))

  if (close) {
    const mid = clampPct((minPct + maxPct) / 2, 4)
    return (
      <small
        className="pointer-events-none absolute -top-2 -translate-x-1/2"
        style={{ left: `${mid}%` }}
      >
        {min}-{labelFor(max ?? undefined, cap)}
      </small>
    )
  }

  return (
    <>
      <small
        className="pointer-events-none absolute -top-2 -translate-x-1/2"
        style={{ left: `${maxPct}%` }}
      >
        {labelFor(max ?? undefined, cap)}
      </small>
      <small
        className="pointer-events-none absolute -top-2 -translate-x-1/2"
        style={{ left: `${minPct}%` }}
      >
        {min}
      </small>
    </>
  )
}
