'use client'

import { useState } from 'react'
import { Amount, Button, cn, Input, Text } from '@dorado/components'
import { Plus, Trash2 } from '@dorado/icons'
import type { RateBandsBody, RatePay } from '@dorado/contracts'

import { Panel } from '../../_components'
import { formatMoney, rangeLabel, unitShort } from '../../_lib'
import { draftMin, toBody, toDrafts, type DraftBand } from '../_lib'

export type RateType = 'all' | 'scrap' | 'bullion'

export type MetalRatesCardProps = {
  metalId: string
  bands: RatePay[]
  type: RateType
  mobile: boolean
  changed: React.ReactNode
  editing: boolean
  pending: boolean
  error: string | null
  onEdit: () => void
  onCancel: () => void
  onDirty: () => void
  onSave: (body: RateBandsBody) => void
}

const showScrap = (type: RateType) => type !== 'bullion'
const showBullion = (type: RateType) => type !== 'scrap'

function Figure({
  fraction,
  pay,
  unit,
  align,
}: {
  fraction: number
  pay: number | null
  unit: string
  align: 'start' | 'end'
}) {
  return (
    <div className={cn('flex flex-col gap-3xs', align === 'end' && 'items-end')}>
      <Amount
        tag="stat-xs"
        value={fraction}
        format={{ style: 'percent', maximumFractionDigits: 2 }}
      />
      <Text variant="small">{`${formatMoney(pay)} / ${unitShort(unit)}`}</Text>
    </div>
  )
}

function viewGrid(type: RateType) {
  return type === 'all'
    ? 'grid grid-cols-[minmax(0,1fr)_10rem_10rem] gap-md'
    : 'grid grid-cols-[minmax(0,1fr)_10rem] gap-md'
}

function ViewRows({ bands, type, mobile }: { bands: RatePay[]; type: RateType; mobile: boolean }) {
  if (mobile) {
    return (
      <ul className="flex flex-col divide-y divide-border">
        {bands.map((band) => (
          <li key={band.id} className="flex flex-col gap-xs py-xs-plus">
            <Text variant="small-medium" emphasis="default">
              {rangeLabel(band.min_qty, band.max_qty, unitShort(band.unit))}
            </Text>
            <div className="flex justify-between gap-md">
              {showScrap(type) && (
                <div className="flex flex-col gap-3xs">
                  <Text variant="micro">SCRAP</Text>
                  <Figure
                    fraction={band.scrap_pct}
                    pay={band.scrap_pay}
                    unit={band.display_unit}
                    align="start"
                  />
                </div>
              )}
              {showBullion(type) && (
                <div className="flex flex-col items-end gap-3xs">
                  <Text variant="micro">BULLION</Text>
                  <Figure
                    fraction={band.bullion_pct}
                    pay={band.bullion_pay}
                    unit={band.display_unit}
                    align="end"
                  />
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <ul className="flex flex-col divide-y divide-border">
      <li aria-hidden className={cn(viewGrid(type), 'py-xs-plus')}>
        <Text variant="micro">RANGE</Text>
        {showScrap(type) && (
          <Text variant="micro" className="text-right">
            SCRAP
          </Text>
        )}
        {showBullion(type) && (
          <Text variant="micro" className="text-right">
            BULLION
          </Text>
        )}
      </li>
      {bands.map((band) => (
        <li key={band.id} className={cn(viewGrid(type), 'items-center py-xs-plus')}>
          <Text variant="small-medium" emphasis="default">
            {rangeLabel(band.min_qty, band.max_qty, unitShort(band.unit))}
          </Text>
          {showScrap(type) && (
            <Figure
              fraction={band.scrap_pct}
              pay={band.scrap_pay}
              unit={band.display_unit}
              align="end"
            />
          )}
          {showBullion(type) && (
            <Figure
              fraction={band.bullion_pct}
              pay={band.bullion_pay}
              unit={band.display_unit}
              align="end"
            />
          )}
        </li>
      ))}
    </ul>
  )
}

function EditRows({
  drafts,
  unit,
  mobile,
  onChange,
  onRemove,
}: {
  drafts: DraftBand[]
  unit: string
  mobile: boolean
  onChange: (index: number, draft: DraftBand) => void
  onRemove: (index: number) => void
}) {
  const last = drafts.length - 1
  const range = (draft: DraftBand, index: number) => (
    <Input
      aria-label={`Band ${index + 1} up to`}
      inputMode="decimal"
      leadingLabel={`${draftMin(drafts, index)} –`}
      trailing={unit}
      placeholder="No limit"
      readOnly={index === last}
      value={index === last ? '' : draft.max}
      onChange={(event) => onChange(index, { ...draft, max: event.target.value })}
      className={mobile ? 'flex-1' : 'w-50'}
    />
  )
  const remove = (index: number) => (
    <Button
      variant="tertiary"
      size="iconSm"
      aria-label={`Remove band ${index + 1}`}
      disabled={drafts.length === 1}
      onClick={() => onRemove(index)}
    >
      <Trash2 aria-hidden />
    </Button>
  )
  const rate = (draft: DraftBand, index: number, key: 'scrap' | 'bullion', label?: string) => (
    <Input
      label={label}
      aria-label={label ? undefined : `Band ${index + 1} ${key}`}
      inputMode="decimal"
      trailing="%"
      value={draft[key]}
      onChange={(event) => onChange(index, { ...draft, [key]: event.target.value })}
    />
  )

  if (mobile) {
    return (
      <ul className="flex flex-col divide-y divide-border">
        {drafts.map((draft, index) => (
          <li key={index} className="flex flex-col gap-sm py-xs-plus">
            <div className="flex items-center gap-xs">
              {range(draft, index)}
              {remove(index)}
            </div>
            <div className="grid grid-cols-2 gap-sm">
              {rate(draft, index, 'scrap', 'Scrap')}
              {rate(draft, index, 'bullion', 'Bullion')}
            </div>
          </li>
        ))}
      </ul>
    )
  }

  const grid = 'grid grid-cols-[minmax(0,1fr)_10rem_10rem_2rem] gap-md'
  return (
    <ul className="flex flex-col divide-y divide-border">
      <li aria-hidden className={cn(grid, 'py-xs-plus')}>
        <Text variant="micro">RANGE (UP TO)</Text>
        <Text variant="micro">SCRAP</Text>
        <Text variant="micro">BULLION</Text>
        <span />
      </li>
      {drafts.map((draft, index) => (
        <li key={index} className={cn(grid, 'items-center py-xs-plus')}>
          {range(draft, index)}
          {rate(draft, index, 'scrap')}
          {rate(draft, index, 'bullion')}
          {remove(index)}
        </li>
      ))}
    </ul>
  )
}

export function MetalRatesCard({
  metalId,
  bands,
  type,
  mobile,
  changed,
  editing,
  pending,
  error,
  onEdit,
  onCancel,
  onDirty,
  onSave,
}: MetalRatesCardProps) {
  const [drafts, setDrafts] = useState<DraftBand[]>(() => toDrafts(bands))
  const unit = unitShort(bands[0]?.unit ?? 'troy_oz')

  const change = (next: DraftBand[]) => {
    setDrafts(next)
    onDirty()
  }

  return (
    <Panel
      title={metalId}
      trailing={
        editing ? undefined : (
          <Button variant="tertiary" size="sm" onClick={onEdit}>
            Edit
          </Button>
        )
      }
    >
      {editing ? (
        <>
          <EditRows
            drafts={drafts}
            unit={unit}
            mobile={mobile}
            onChange={(index, draft) =>
              change(drafts.map((entry, at) => (at === index ? draft : entry)))
            }
            onRemove={(index) => change(drafts.filter((_, at) => at !== index))}
          />
          {error && (
            <Text variant="micro">
              <span className="text-destructive">{error}</span>
            </Text>
          )}
          <div className="flex items-center justify-between gap-md pt-sm">
            <Button
              variant="tertiary"
              size="sm"
              onClick={() =>
                change([
                  ...drafts.slice(0, -1),
                  ...drafts.slice(-1).map((draft) => ({ ...draft, max: '' })),
                  {
                    max: '',
                    scrap: drafts.at(-1)?.scrap ?? '',
                    bullion: drafts.at(-1)?.bullion ?? '',
                  },
                ])
              }
            >
              <Plus aria-hidden />
              Add range
            </Button>
            <div className="flex items-center gap-md">
              <Button variant="tertiary" size="sm" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={pending || error !== null}
                onClick={() => onSave(toBody(drafts))}
              >
                Save rates
              </Button>
            </div>
          </div>
        </>
      ) : (
        <>
          <ViewRows bands={bands} type={type} mobile={mobile} />
          <Text variant="micro" className="pt-sm">
            {changed}
          </Text>
        </>
      )}
    </Panel>
  )
}
