'use client'

import { useMemo } from 'react'
import { Button } from '@/shared/ui/base/button'
import { useRates } from '@/lib/queries/useRates'
import { pctLabel } from '@/types/rates'
import { cn } from '@/shared/utils/cn'
import { GoldIcon, PalladiumIcon, PlatinumIcon, SilverIcon } from '@/features/navigation/ui/Logo'
import { CoinsIcon, IconProps, ScalesIcon } from '@phosphor-icons/react'

type MetalName = 'Gold' | 'Silver' | 'Platinum' | 'Palladium'
type RateRow = {
  metal: MetalName
  min_qty: number
  max_qty: number | null
  unit: string | null
  scrap_pct: number | null
  bullion_pct: number | null
}

const METAL_ICONS: Record<MetalName, (props: { size?: number }) => React.ReactNode> = {
  Gold: ({ size = 36 }) => <GoldIcon size={size} className="text-primary" />,
  Silver: ({ size = 36 }) => <SilverIcon size={size} className="text-primary" />,
  Platinum: ({ size = 36 }) => <PlatinumIcon size={size} className="text-primary" />,
  Palladium: ({ size = 36 }) => <PalladiumIcon size={size} className="text-primary" />,
}

function LabelWithIcon({
  Icon,
  children,
  className = 'flex items-center gap-2',
  iconSize = 36,
}: {
  Icon?: React.ComponentType<IconProps> | (() => React.ReactNode)
  children: React.ReactNode
  className?: string
  iconSize?: number
}) {
  return (
    <span className={className}>
      {Icon && <Icon size={iconSize} className="text-primary" />}
      {children}
    </span>
  )
}

const ORDER: MetalName[] = ['Gold', 'Silver', 'Platinum', 'Palladium']

export default function RatesPage() {
  const { data: rates = [] } = useRates()
  const grouped = useMemo(() => groupRates(rates as RateRow[]), [rates])

  return (
    <main className="relative w-full flex flex-col items-center">
      <section className="w-full px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-4">
        <div className="flex flex-col items-start gap-2 max-w-6xl mx-auto mb-4">
          <h1 className="text-neutral-900 text-2xl sm:text-3xl font-semibold tracking-tight">
            Industry-Leading Rates
          </h1>
          <p className="text-neutral-700 mt-3 max-w-xl text-sm sm:text-base leading-relaxed">
            We're focused on delivering the best possible return for your metal, often 30-40% higher
            than local shops. Pricing is by volume based on total metal content. Higher volume,
            higher payout. Within each volume band, rates are set separately for bullion and scrap.
          </p>
        </div>
      </section>

      <section className="relative w-full px-4 sm:px-6 lg:px-8 pb-10 sm:pb-14">
        <div className="max-w-6xl mx-auto flex flex-col gap-6">
          {ORDER.filter((m) => grouped[m]).map((metal) => (
            <MetalCard key={metal} metal={metal} data={grouped[metal]!} />
          ))}
          {!rates.length && (
            <div className="text-center text-neutral-600 text-sm">Loading current rates…</div>
          )}
        </div>
      </section>
    </main>
  )
}

function MetalCard({
  metal,
  data,
}: {
  metal: MetalName
  data: {
    unit: string
    columns: Array<{
      key: string
      min: number
      max: number | null
      label: string
      scrap_pct: number | null
      bullion_pct: number | null
    }>
  }
}) {
  const cols = ensureAtLeastFour(data.columns)
  return (
    <article className="rounded-lg bg-card raised-off-page">
      <MobileRates metal={metal} cols={cols} />
      <DesktopRates metal={metal} cols={cols} />
    </article>
  )
}

function MobileRates({
  metal,
  cols,
}: {
  metal: MetalName
  cols: Array<{ key: string; label: string; scrap_pct: number | null; bullion_pct: number | null }>
}) {
  return (
    <>
      <div className="px-4 sm:px-6 pt-4 md:hidden">
        <h2 className="text-neutral-900 text-xl sm:text-2xl font-semibold">
          <LabelWithIcon
            Icon={() => METAL_ICONS[metal]({ size: 36 })}
            className="flex items-center gap-2"
          >
            {metal}
          </LabelWithIcon>
        </h2>
      </div>

      <div className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:hidden">
        <div className="grid grid-cols-1 gap-3">
          {cols.map((c) => (
            <MobileBandCard
              key={c.key}
              label={c.label}
              scrapPct={c.scrap_pct}
              bullionPct={c.bullion_pct}
            />
          ))}
        </div>
      </div>
    </>
  )
}

function DesktopRates({
  metal,
  cols,
}: {
  metal: MetalName
  cols: Array<{ key: string; label: string; scrap_pct: number | null; bullion_pct: number | null }>
}) {
  return (
    <div className="hidden md:grid px-4 sm:px-6 pt-4 pb-4 grid-cols-5">
      <h2 className="col-span-1 text-neutral-900 text-xl font-semibold">
        <LabelWithIcon
          Icon={() => METAL_ICONS[metal]({ size: 36 })}
          className="flex items-center gap-2"
        >
          {metal}
        </LabelWithIcon>
      </h2>
      <div className="col-span-4">
        <BandChips cols={cols} />
      </div>

      <div className="col-span-5 h-px bg-border my-3" />

      <RatesRow
        label="Scrap"
        values={cols.map((c) => c.scrap_pct)}
        icon={ScalesIcon}
        className="col-span-5"
      />
      <RatesRow
        label="Bullion"
        values={cols.map((c) => c.bullion_pct)}
        icon={CoinsIcon}
        className="col-span-5"
      />
    </div>
  )
}

function BandChips({
  cols,
  className,
  chipClassName = 'rounded-full border border-border px-3 py-1 text-base text-neutral-800',
  gridClassName = 'grid grid-cols-4 gap-2',
}: {
  cols: Array<{ key: string; label: string }>
  className?: string
  chipClassName?: string
  gridClassName?: string
}) {
  return (
    <div className={cn(className)}>
      <div className={gridClassName}>
        {cols.map((c) => (
          <div key={c.key} className="flex items-center justify-center">
            <span className={chipClassName}>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RatesRow({
  label,
  values,
  className,
  icon,
  labelClassName = 'text-neutral-800 text-lg',
  cellClassName = 'flex items-center justify-center px-3 py-3.5',
  valueClassName = 'text-neutral-900 text-4xl font-semibold',
  showDividers = true,
}: {
  label: string
  values: Array<number | null>
  className?: string
  icon?: React.ComponentType<IconProps>
  labelClassName?: string
  cellClassName?: string
  valueClassName?: string
  showDividers?: boolean
}) {
  const Icon = icon
  return (
    <div className={cn('contents md:grid md:grid-cols-5', className)}>
      <div className="col-span-1 flex items-center py-3.5 rounded-l-xl">
        <LabelWithIcon Icon={Icon} iconSize={24}>
          <span className={labelClassName}>{label}</span>
        </LabelWithIcon>
      </div>

      {values.map((v, i) => (
        <RateValueCell
          key={`${label}-${i}`}
          value={v}
          className={cellClassName}
          valueClassName={valueClassName}
          withLeftBorder={showDividers && i > 0}
        />
      ))}
    </div>
  )
}

function RateValueCell({
  value,
  className,
  valueClassName,
  withLeftBorder,
}: {
  value: number | null
  className?: string
  valueClassName?: string
  withLeftBorder?: boolean
}) {
  return (
    <div className={cn(className, withLeftBorder && 'border-l border-border')}>
      <span className={valueClassName}>{value == null ? '—' : pctLabel(value)}</span>
    </div>
  )
}

function MobileBandCard({
  label,
  scrapPct,
  bullionPct,
  wrapperClassName = 'rounded-lg bg-highest p-4 border border-border',
  chipClassName = 'inline-flex items-center rounded-full border border-border px-2.5 py-1 text-sm bg-primary text-white',
  pairLabelClassName = 'text-neutral-800 text-base',
  pairValueClassName = 'text-neutral-900 text-3xl font-semibold',
}: {
  label: string
  scrapPct: number | null
  bullionPct: number | null
  wrapperClassName?: string
  chipClassName?: string
  pairLabelClassName?: string
  pairValueClassName?: string
}) {
  return (
    <div className={wrapperClassName}>
      <div className="mb-2">
        <span className={chipClassName}>{label}</span>
      </div>

      <dl className="grid grid-rows-2 gap-3">
        <RatePair
          label="Scrap"
          value={scrapPct}
          icon={ScalesIcon}
          iconSize={20}
          labelClassName={pairLabelClassName}
          valueClassName={pairValueClassName}
        />
        <RatePair
          label="Bullion"
          value={bullionPct}
          icon={CoinsIcon}
          iconSize={20}
          labelClassName={pairLabelClassName}
          valueClassName={pairValueClassName}
        />
      </dl>
    </div>
  )
}

function RatePair({
  label,
  value,
  labelClassName,
  valueClassName,
  icon,
  iconSize = 16,
}: {
  label: string
  value: number | null
  labelClassName: string
  valueClassName: string
  icon?: React.ComponentType<IconProps>
  iconSize?: number
}) {
  const Icon = icon
  return (
    <div className="flex items-center justify-between">
      <dt className={labelClassName}>
        <span className="inline-flex items-center gap-1.5">
          {Icon && <Icon size={iconSize} className="text-primary" />}
          {label}
        </span>
      </dt>
      <dd className={valueClassName}>{value == null ? '—' : pctLabel(value)}</dd>
    </div>
  )
}

function groupRates(rows: RateRow[]) {
  const byMetal: Partial<
    Record<
      MetalName,
      {
        unit: string
        columns: Array<{
          key: string
          min: number
          max: number | null
          label: string
          scrap_pct: number | null
          bullion_pct: number | null
        }>
      }
    >
  > = {}

  for (const r of rows) {
    const metal = r.metal
    const unit = prettifyUnit(r.unit ?? 'oz')
    const key = `${r.min_qty}-${r.max_qty ?? 'inf'}-${unit}`
    const label = formatBandLabel(r.min_qty ?? 0, r.max_qty, unit)

    if (!byMetal[metal]) byMetal[metal] = { unit, columns: [] }

    const existing = byMetal[metal]!.columns.find((c) => c.key === key)
    if (existing) {
      if (r.scrap_pct != null) existing.scrap_pct = r.scrap_pct
      if (r.bullion_pct != null) existing.bullion_pct = r.bullion_pct
    } else {
      byMetal[metal]!.columns.push({
        key,
        min: r.min_qty ?? 0,
        max: r.max_qty ?? null,
        label,
        scrap_pct: r.scrap_pct ?? null,
        bullion_pct: r.bullion_pct ?? null,
      })
    }
  }

  for (const m of Object.keys(byMetal) as MetalName[]) {
    byMetal[m]!.columns.sort((a, b) => {
      if (a.min !== b.min) return a.min - b.min
      const ax = a.max ?? Number.POSITIVE_INFINITY
      const bx = b.max ?? Number.POSITIVE_INFINITY
      return ax - bx
    })
  }

  return byMetal as Record<
    MetalName,
    {
      unit: string
      columns: Array<{
        key: string
        min: number
        max: number | null
        label: string
        scrap_pct: number | null
        bullion_pct: number | null
      }>
    }
  >
}

function prettifyUnit(u: string) {
  const v = u.toLowerCase().replace(/_/g, ' ')
  if (v === 'troy oz' || v === 'troy ounce' || v === 'troy ounces') return 'oz'
  if (v === 'oz' || v === 'ounce' || v === 'ounces') return 'oz'
  return v
}

function formatBandLabel(min: number, max: number | null, unit: string) {
  const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
  const ndash = '–'
  if (max == null) return `${nf.format(min)}+ ${unit}`
  return `${nf.format(min)}${ndash}${nf.format(max)} ${unit}`
}

function ensureAtLeastFour<T extends { label: string }>(arr: T[]) {
  if (arr.length >= 4) return arr.slice(0, 4)
  const pads = 4 - arr.length
  return [
    ...arr,
    ...(Array.from({ length: pads }).map((_, i) => ({
      ...(arr[arr.length - 1] ?? ({} as T)),
      label: '—',
      scrap_pct: null,
      bullion_pct: null,
      key: `pad-${i}`,
      min: 0,
      max: null,
    })) as unknown as T[]),
  ]
}
