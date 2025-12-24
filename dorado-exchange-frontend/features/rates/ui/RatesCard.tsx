'use client'

import * as React from 'react'
import { Button } from '@/shared/ui/base/button'
import { Input } from '@/shared/ui/base/input'
import { cn } from '@/shared/utils/cn'
import { PencilSimpleIcon, FloppyDiskIcon, XIcon } from '@phosphor-icons/react'
import {
  Rate,
  getBoundsForMetal,
  sortRatesByMin,
  pctToInt,
  intToPct,
  labelFor,
} from '@/features/rates/types'
import { DualRangeSlider } from '@/features/rates/ui/DualRangeSlider'
import { useCreateRate, useDeleteRate, useUpdateRate } from '@/features/rates/queries'

export default function RatesCard({
  metal,
  rates,
  className,
}: {
  metal: string
  rates: Rate[]
  className?: string
}) {
  const [editing, setEditing] = React.useState(false)
  const unit = rates[0]?.unit ?? 'troy_oz'
  const { cap, step } = getBoundsForMetal(metal)

  const [items, setItems] = React.useState<Rate[]>(() => sortRatesByMin(rates))
  const [dirtyIds, setDirtyIds] = React.useState<Set<string>>(new Set())

  React.useEffect(() => {
    if (!editing) return
    setItems(sortRatesByMin(rates))
    setDirtyIds(new Set())
  }, [editing])

  React.useEffect(() => {
    if (editing) return
    setItems(sortRatesByMin(rates))
    setDirtyIds(new Set())
  }, [rates, editing])

  const update = useUpdateRate()
  const create = useCreateRate()
  const del = useDeleteRate()

  function patchLocal(id: string, patch: Partial<Rate>) {
    setItems((prev) => {
      const next = prev.map((r) => (r.id === id ? ({ ...r, ...patch } as Rate) : r))
      return sortRatesByMin(next)
    })
    setDirtyIds((s) => new Set(s).add(id))
  }

  const onSaveAll = () => {
    const dirty = items.filter((r) => dirtyIds.has(r.id))
    for (const r of dirty) {
      update.mutate({ rate: r, user_name: 'Dorado Admin' })
    }
    setDirtyIds(new Set())
    setEditing(false)
  }

  return (
    <div className={cn('rounded-lg p-4 bg-card raised-off-page', className)}>
      <Header
        metal={metal}
        editing={editing}
        onCancel={() => {
          setItems(sortRatesByMin(rates))
          setDirtyIds(new Set())
          setEditing(false)
        }}
        onSaveAll={onSaveAll}
        onEdit={() => setEditing(true)}
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
          onDelete={(row) => del.mutate(row)}
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
      <div className="text-base tracking-wide text-neutral-600">{metal}</div>
      {!editing ? (
        <Button
          size="sm"
          variant="link"
          onClick={onEdit}
          className="gap-1 text-primary hover:text-primary text-sm sm:text-base"
        >
          <PencilSimpleIcon size={20} className="text-primary" />
          Edit
        </Button>
      ) : (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="link"
            onClick={onCancel}
            className="gap-1 text-sm sm:text-base text-neutral-600 hover:text-neutral-900"
          >
            <XIcon size={20} />
            Cancel
          </Button>
          <Button
            size="sm"
            className="gap-1 bg-primary hover:bg-primary text-white hover:text-white raised-off-page text-sm sm:text-base"
            onClick={onSaveAll}
          >
            <FloppyDiskIcon size={20} />
            Save
          </Button>
        </div>
      )}
    </div>
  )
}

function ReadView({ unit, rows }: { unit: string; rows: Rate[] }) {
  const u = unit === 'troy_oz' ? 'oz' : unit
  return (
    <div className="border rounded-lg p-4 bg-neutral-100/50">
      <div className="flex items-center text-sm text-neutral-700 px-1 mb-4">
        <div className="basis-0 grow-[2] text-left text-xs text-neutral-600 tracking-widest">
          Range (oz)
        </div>
        <div className="basis-0 grow text-center text-xs text-neutral-600 tracking-widest">
          Scrap
        </div>
        <div className="basis-0 grow text-center text-xs text-neutral-600 tracking-widest">
          Bullion
        </div>
      </div>

      <div className="mt-2 space-y-6">
        {rows.map((r) => (
          <div key={r.id} className="flex items-end px-1">
            <div className="basis-0 grow-[2] text-sm sm:text-base tracking-wide tabular-nums">
              {r.max_qty == null ? `${r.min_qty}+ ${u}` : `${r.min_qty}–${r.max_qty} ${u}`}
            </div>
            <div className="basis-0 grow text-2xl sm:text-3xl font-semibold text-center">
              {Math.round((r.scrap_pct ?? 0) * 100)}%
            </div>
            <div className="basis-0 grow text-2xl sm:text-3xl font-semibold text-center">
              {Math.round((r.bullion_pct ?? 0) * 100)}%
            </div>
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
  rows: Rate[]
  cap: number
  step: number
  onRangeChange: (id: string, min: number, max: number | null) => void
  onScrapChange: (id: string, pctInt: number) => void
  onBullChange: (id: string, pctInt: number) => void
  onDelete: (row: Rate) => void
  onAdd: () => void
  dirtyIds: Set<string>
}) {
  const u = unit === 'troy_oz' ? 'oz' : unit

  return (
    <div className="border rounded-lg p-4 bg-background">
      <div className="flex items-center text-sm text-neutral-700 px-1 mb-4">
        <div className="basis-0 grow-[2] text-left text-xs text-neutral-600 tracking-widest">
          Range (oz)
        </div>
        <div className="basis-0 grow text-center text-xs text-neutral-600 tracking-widest">
          Scrap
        </div>
        <div className="basis-0 grow text-center text-xs text-neutral-600 tracking-widest">
          Bullion
        </div>
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
        <div className="text-xs text-neutral-500">
          Units: <span className="font-medium">{u}</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1 text-xs sm:text-sm"
          type="button"
          onClick={onAdd}
        >
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
    <div className="flex items-center gap-1">
      <Input
        className={cn(
          'h-10 w-16 text-center text-lg font-semibold no-spinner input-floating-label-form bg-card',
          isDirty && 'ring-2 ring-primary/60'
        )}
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
      <span
        className="pointer-events-none absolute -top-2 -translate-x-1/2 text-sm"
        style={{ left: `${mid}%` }}
      >
        {min}-{labelFor(max ?? undefined, cap)}
      </span>
    )
  }

  return (
    <>
      <span
        className="pointer-events-none absolute -top-2 -translate-x-1/2 text-sm"
        style={{ left: `${maxPct}%` }}
      >
        {labelFor(max ?? undefined, cap)}
      </span>
      <span
        className="pointer-events-none absolute -top-2 -translate-x-1/2 text-sm"
        style={{ left: `${minPct}%` }}
      >
        {min}
      </span>
    </>
  )
}
