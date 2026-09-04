'use client'

import { useRateTiers } from '@dorado/client'
import { pctLabel } from '@/features/rates/types'
import { cn } from '@/shared/utils/cn'
import { GoldIcon, PalladiumIcon, PlatinumIcon, SilverIcon } from '@/features/navigation/ui/Logo'
import { Coins, IconProps, Scale } from '@dorado/components'
import type { RateBand, RateTier } from '@dorado/contracts'

// THE TABLE IS THE SERVER'S. This page used to take the flat rate list and, in
// the browser, group it by metal, dedupe bands by (min, max, unit), prettify
// the unit, format each band's label, sort the columns and pad them to four -
// about 90 lines deciding what a customer is told we pay. GET /rates/tiers
// answers all of it (api/domain/rates/rules.ts).
//
// What is left here is the ICON per metal and the four-column grid, which are
// the two things that genuinely are presentation.
const METAL_ICONS: Record<string, (props: { size?: number }) => React.ReactNode> = {
  Gold: ({ size = 36 }) => <GoldIcon size={size} />,
  Silver: ({ size = 36 }) => <SilverIcon size={size} />,
  Platinum: ({ size = 36 }) => <PlatinumIcon size={size} />,
  Palladium: ({ size = 36 }) => <PalladiumIcon size={size} />,
}

const ORDER = ['Gold', 'Silver', 'Platinum', 'Palladium']

function LabelWithIcon({
  Icon,
  children,
  className = 'flex items-center gap-2',
  iconSize = 36,
}: {
  Icon?: React.ComponentType<IconProps> | ((props: { size?: number }) => React.ReactNode)
  children: React.ReactNode
  className?: string
  iconSize?: number
}) {
  return (
    <span className={className}>
      {Icon ? <Icon size={iconSize} /> : null}
      {children}
    </span>
  )
}

export default function RatesPage() {
  const { data: tiers = [] } = useRateTiers()
  const ordered = [...tiers].sort(
    (a, b) => ORDER.indexOf(a.metal) - ORDER.indexOf(b.metal)
  )

  return (
    <main className="relative w-full flex flex-col items-center">
      <section className="w-full px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-4">
        <div className="flex flex-col items-start gap-2 max-w-6xl mx-auto mb-4">
          <h1>Industry-Leading Rates</h1>
          <p className="mt-3 max-w-xl">
            We&apos;re focused on delivering the best possible return for your metal, often 30-40%
            higher than local shops. Pricing is by volume based on total metal content. Higher
            volume, higher payout. Within each volume band, rates are set separately for bullion and
            scrap.
          </p>
        </div>
      </section>

      <section className="relative w-full px-4 sm:px-6 lg:px-8 pb-10 sm:pb-14">
        <div className="max-w-6xl mx-auto flex flex-col gap-6">
          {ordered.map((tier) => (
            <MetalCard key={tier.metal} tier={tier} />
          ))}
          {!tiers.length && <p className="text-center">Loading current rates…</p>}
        </div>
      </section>
    </main>
  )
}

// Four columns is the grid this page is built on; a metal with fewer bands
// gets blank cells rather than a narrower card.
const PAD: RateBand = {
  key: 'pad', label: '—', min_qty: 0, max_qty: null,
  scrap_pct: Number.NaN, bullion_pct: Number.NaN,
}

const columns = (bands: RateBand[]): RateBand[] =>
  bands.length >= 4
    ? bands.slice(0, 4)
    : [...bands, ...Array.from({ length: 4 - bands.length }, (_, i) => ({ ...PAD, key: `pad-${i}` }))]

function MetalCard({ tier }: { tier: RateTier }) {
  const cols = columns(tier.bands)
  const Icon = METAL_ICONS[tier.metal]
  return (
    <article className="rounded-lg bg-card border border-border">
      <div className="px-4 sm:px-6 pt-4 md:hidden">
        <h2>
          <LabelWithIcon Icon={Icon} className="flex items-center gap-2">
            {tier.metal}
          </LabelWithIcon>
        </h2>
      </div>

      <div className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:hidden">
        <div className="grid grid-cols-1 gap-3">
          {cols.map((band) => (
            <MobileBandCard key={band.key} band={band} />
          ))}
        </div>
      </div>

      <div className="hidden md:grid px-4 sm:px-6 pt-4 pb-4 grid-cols-5">
        <h2 className="col-span-1">
          <LabelWithIcon Icon={Icon} className="flex items-center gap-2">
            {tier.metal}
          </LabelWithIcon>
        </h2>
        <div className="col-span-4">
          <div className="grid grid-cols-4 gap-2">
            {cols.map((band) => (
              <div key={band.key} className="flex items-center justify-center">
                <span className="rounded-full border border-border px-3 py-1">{band.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-5 h-px bg-border my-3" />

        <RatesRow label="Scrap" icon={Scale} values={cols.map((c) => c.scrap_pct)} />
        <RatesRow label="Bullion" icon={Coins} values={cols.map((c) => c.bullion_pct)} />
      </div>
    </article>
  )
}

const cell = (value: number) => (Number.isFinite(value) ? pctLabel(value) : '—')

function RatesRow({
  label,
  values,
  icon,
}: {
  label: string
  values: number[]
  icon: React.ComponentType<IconProps>
}) {
  return (
    <div className="contents md:grid md:grid-cols-5 col-span-5">
      <div className="col-span-1 flex items-center py-3.5 rounded-l-xl">
        <LabelWithIcon Icon={icon} iconSize={24}>
          <span>{label}</span>
        </LabelWithIcon>
      </div>
      {values.map((value, i) => (
        <div
          key={`${label}-${i}`}
          className={cn(
            'flex items-center justify-center px-3 py-3.5',
            i > 0 && 'border-l border-border'
          )}
        >
          <strong className="stat">{cell(value)}</strong>
        </div>
      ))}
    </div>
  )
}

function MobileBandCard({ band }: { band: RateBand }) {
  return (
    <div className="rounded-lg bg-highest p-4 border border-border">
      <div className="mb-2">
        <span className="inline-flex items-center rounded-full border border-border px-2.5 py-1 bg-primary text-primary-foreground">
          {band.label}
        </span>
      </div>

      <dl className="grid grid-rows-2 gap-3">
        <RatePair label="Scrap" value={band.scrap_pct} icon={Scale} />
        <RatePair label="Bullion" value={band.bullion_pct} icon={Coins} />
      </dl>
    </div>
  )
}

function RatePair({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: React.ComponentType<IconProps>
}) {
  return (
    <div className="flex items-center justify-between">
      <dt>
        <span className="inline-flex items-center gap-1.5">
          <Icon size={20} />
          {label}
        </span>
      </dt>
      <dd>
        <strong className="stat-sm">{cell(value)}</strong>
      </dd>
    </div>
  )
}
