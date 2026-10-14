'use client'

import { useState } from 'react'
import {
  Accordion,
  Button,
  DatePicker,
  Input,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  Text,
} from '@dorado/components'
import { TrendingDown, TrendingUp } from '@dorado/icons'
import type {
  MetalSpot,
  SpotAdjustmentMode,
  SpotAdjustmentPatch,
  SpotAdjustmentUnit,
} from '@dorado/contracts'

import {
  adjustmentAmount,
  EASTERN_SLOTS,
  easternInstant,
  formatClock,
  formatMarketOpen,
  unsigned,
} from '../../_lib'
import { formatMoney } from '../../../_lib'

export type AdjustmentSectionProps = {
  metal: MetalSpot
  pending: boolean
  error: string | null
  className?: string
  onSave: (patch: SpotAdjustmentPatch) => void
  onClear: () => void
}

type Side = { value: string; down: boolean }

const sideOf = (amount: number | undefined): Side =>
  amount === undefined ? { value: '', down: true } : { value: unsigned(amount), down: amount < 0 }

const signed = (side: Side): number => Number(side.down ? `-${side.value}` : side.value)

const valid = (side: Side) => side.value.trim() !== '' && Number.isFinite(Number(side.value))

function AmountField({
  label,
  side,
  unit,
  onChange,
  onUnit,
}: {
  label: string
  side: Side
  unit: SpotAdjustmentUnit
  onChange: (side: Side) => void
  onUnit: (unit: SpotAdjustmentUnit) => void
}) {
  return (
    <div className="flex items-end gap-md">
      <Input
        label={label}
        inputMode="decimal"
        value={side.value}
        onChange={(event) => onChange({ ...side, value: event.target.value })}
        className="min-w-0 flex-1"
        trailing={
          <span className="flex items-center gap-2xs">
            {(['percent', 'dollars'] as const).map((choice) => (
              <Button
                key={choice}
                type="button"
                variant="tertiary"
                size="iconInline"
                aria-pressed={unit === choice}
                aria-label={choice === 'percent' ? 'Percent' : 'Dollars'}
                className="aria-pressed:text-foreground"
                onClick={() => onUnit(choice)}
              >
                {choice === 'percent' ? '%' : '$'}
              </Button>
            ))}
          </span>
        }
      />
      <div className="flex items-center gap-xs">
        <Button
          type="button"
          variant={side.down ? 'secondary' : 'tertiary'}
          size="icon"
          aria-label={`${label} down`}
          aria-pressed={side.down}
          onClick={() => onChange({ ...side, down: true })}
        >
          <TrendingDown aria-hidden />
        </Button>
        <Button
          type="button"
          variant={side.down ? 'tertiary' : 'secondary'}
          size="icon"
          aria-label={`${label} up`}
          aria-pressed={!side.down}
          onClick={() => onChange({ ...side, down: false })}
        >
          <TrendingUp aria-hidden />
        </Button>
      </div>
    </div>
  )
}

export function adjustmentSummary(metal: MetalSpot): string {
  const adjustment = metal.adjustment
  if (!adjustment) return 'None'
  if (adjustment.mode === 'freeze') return `Frozen at ${formatClock(adjustment.updated_at)}`
  return `${adjustment.scope}, ${adjustmentAmount(adjustment)}`
}

export function AdjustmentSection({
  metal,
  pending,
  error,
  className,
  onSave,
  onClear,
}: AdjustmentSectionProps) {
  const adjustment = metal.adjustment
  const adjusting = adjustment?.mode === 'adjust' ? adjustment : null
  const [mode, setMode] = useState<SpotAdjustmentMode>(adjustment?.mode ?? 'adjust')
  const [unit, setUnit] = useState<SpotAdjustmentUnit>(adjusting?.unit ?? 'percent')
  const [bid, setBid] = useState<Side>(sideOf(adjusting?.bid_amount))
  const [ask, setAsk] = useState<Side>(sideOf(adjusting?.ask_amount))
  const [reason, setReason] = useState(adjustment?.reason ?? '')
  const [marketOpen, setMarketOpen] = useState(adjustment?.expires_at_market_open ?? true)
  const [day, setDay] = useState<Date | undefined>(undefined)
  const [time, setTime] = useState<string | null>(null)
  const pickExpiry = metal.market_open

  const frozen = adjustment?.mode === 'freeze'
  const needsReason = !adjustment && reason.trim() === ''
  const nextOpen =
    adjustment?.expires_at_market_open && adjustment.expires_at_resolved
      ? adjustment.expires_at_resolved
      : metal.next_market_open
  const expiry = marketOpen && nextOpen ? formatMarketOpen(nextOpen) : null
  const expiryPatch = pickExpiry
    ? {
        expires_at_market_open: false,
        expires_at: day && time ? easternInstant(day, time) : null,
      }
    : { expires_at_market_open: marketOpen, expires_at: null }

  const holding = frozen
    ? `Holding bid ${formatMoney(adjustment.frozen_bid)} and ask ${formatMoney(
        adjustment.frozen_ask
      )} from the ${formatClock(adjustment.updated_at)} tick. The source is ignored until this ends.`
    : `Holding bid ${formatMoney(metal.last_bid)} and ask ${formatMoney(
        metal.last_ask
      )} from the ${formatClock(metal.last_tick_at)} tick. The source is ignored until this ends.`

  const save = () =>
    onSave(
      mode === 'freeze'
        ? { mode, reason, ...expiryPatch }
        : {
            mode,
            unit,
            bid_amount: signed(bid),
            ask_amount: signed(ask),
            reason,
            ...expiryPatch,
          }
    )

  return (
    <Accordion
      label="Adjustment"
      trailing={adjustmentSummary(metal)}
      defaultOpen
      flush
      className={className}
    >
      <div className="flex flex-col gap-md px-md pb-md">
        <Tabs value={mode} onValueChange={(value) => setMode(value as SpotAdjustmentMode)}>
          <TabsList aria-label="Adjustment mode" className="gap-0 *:flex-1">
            <TabsTrigger value="adjust">Adjust</TabsTrigger>
            <TabsTrigger value="freeze">Freeze</TabsTrigger>
          </TabsList>
        </Tabs>
        {mode === 'adjust' ? (
          <>
            <AmountField
              label="Bid adjustment"
              side={bid}
              unit={unit}
              onChange={setBid}
              onUnit={setUnit}
            />
            <AmountField
              label="Ask adjustment"
              side={ask}
              unit={unit}
              onChange={setAsk}
              onUnit={setUnit}
            />
          </>
        ) : (
          <Text variant="small">{holding}</Text>
        )}
        <Input label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        {pickExpiry ? (
          <div className="relative flex flex-col gap-xs">
            <Text variant="micro-medium">Expires at</Text>
            <DatePicker
              layout="slim"
              mode="single"
              weekStartsOn={1}
              selected={day}
              onSelect={setDay}
              disabled={{ before: new Date() }}
              timeGroups={[{ label: 'Time', slots: EASTERN_SLOTS }]}
              timeValue={time}
              onTimeChange={setTime}
              className="w-full"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-xs">
            <Switch
              label="Expire at market open"
              checked={marketOpen}
              onCheckedChange={setMarketOpen}
            />
            {expiry && <Text variant="micro-medium">{expiry}</Text>}
          </div>
        )}
        {error && (
          <Text variant="micro">
            <span className="text-destructive">{error}</span>
          </Text>
        )}
        <div className="flex items-center justify-between gap-xs">
          <Button variant="tertiary" disabled={!adjustment || pending} onClick={onClear}>
            {frozen ? 'Unfreeze' : 'Clear adjustment'}
          </Button>
          <Button
            disabled={pending || needsReason || (mode === 'adjust' && !(valid(bid) && valid(ask)))}
            onClick={save}
          >
            {mode === 'freeze' ? 'Freeze price' : 'Save adjustment'}
          </Button>
        </div>
      </div>
    </Accordion>
  )
}
