'use client'

import * as React from 'react'
import { Divider, Link, Text } from '@dorado/components'
import type { AdoptAssayCandidate, OrderLotPatch } from '@dorado/contracts'

import {
  WEIGHT_LABELS,
  formatDecimal,
  formatFixed,
  formatRatio,
  formatShare,
  percentToRatio,
  ratioToPercent,
} from '../_lib'
import { DecimalField } from './DecimalField'

export type AdoptAssayBodyProps = {
  candidates: readonly AdoptAssayCandidate[]
  layout?: 'desktop' | 'mobile'
  onFiguresChange?: (id: string, figures: OrderLotPatch) => void
  lineHref?: (lineReference: string) => string
}

const weightOf = (figures: OrderLotPatch | null, unit: string | null | undefined) =>
  figures?.post_melt == null ? '—' : `${formatFixed(figures.post_melt)} ${unit ?? 'g'}`

const nameOf = (candidate: AdoptAssayCandidate) => candidate.name

function Shared({
  candidate,
  lineHref,
}: {
  candidate: AdoptAssayCandidate
  lineHref?: AdoptAssayBodyProps['lineHref']
}) {
  const share = candidate.share ?? 1
  if (share >= 1) return null
  const line = candidate.line_reference
  return (
    <span className="flex items-center gap-2xs">
      <Text variant="micro">{`${formatShare(share)} of`}</Text>
      {line != null &&
        (lineHref ? (
          <Link href={lineHref(line)} intent="muted">
            {line}
          </Link>
        ) : (
          <Text variant="micro" className="text-muted-foreground">
            {line}
          </Text>
        ))}
    </span>
  )
}

function CandidateRow({
  candidate,
  layout,
  onFiguresChange,
  lineHref,
}: {
  candidate: AdoptAssayCandidate
  layout: 'desktop' | 'mobile'
  onFiguresChange?: AdoptAssayBodyProps['onFiguresChange']
  lineHref?: AdoptAssayBodyProps['lineHref']
}) {
  const [figures, setFigures] = React.useState<OrderLotPatch>(candidate.proposed)
  const unit = candidate.current.unit ?? candidate.proposed.unit
  const mobile = layout === 'mobile'
  const set = (patch: OrderLotPatch) => {
    const next = { ...figures, ...patch }
    setFigures(next)
    onFiguresChange?.(candidate.id, next)
  }
  const name = (
    <span className="flex min-w-0 flex-col gap-3xs">
      <span className="flex items-center gap-2xs">
        <Text variant="small-medium">{nameOf(candidate)}</Text>
        <Text variant="micro" className="text-muted-foreground">
          {candidate.reference}
        </Text>
      </span>
      <Shared candidate={candidate} lineHref={lineHref} />
    </span>
  )
  const weight = (
    <DecimalField
      label={mobile ? WEIGHT_LABELS.net : undefined}
      ariaLabel={mobile ? undefined : `${WEIGHT_LABELS.net} weight, ${nameOf(candidate)}`}
      value={figures.post_melt}
      format={formatFixed}
      unit={unit ?? 'g'}
      message={mobile ? `Ours: ${weightOf(candidate.current, unit)}` : undefined}
      onCommit={onFiguresChange ? (post_melt) => set({ post_melt }) : undefined}
    />
  )
  const purity = (
    <DecimalField
      label={mobile ? 'Purity' : undefined}
      ariaLabel={mobile ? undefined : `Purity, ${nameOf(candidate)}`}
      value={ratioToPercent(figures.purity)}
      format={formatDecimal}
      unit="%"
      message={mobile ? `Ours: ${formatRatio(candidate.current.purity)}` : undefined}
      onCommit={onFiguresChange ? (next) => set({ purity: percentToRatio(next) }) : undefined}
    />
  )

  if (mobile) {
    return (
      <div data-layout="mobile" className="flex flex-col gap-sm">
        {name}
        <div className="grid grid-cols-2 gap-sm">
          {weight}
          {purity}
        </div>
      </div>
    )
  }

  return (
    <div
      data-layout="desktop"
      className="grid grid-cols-[256px_minmax(0,1fr)_212px] items-center gap-sm"
    >
      {name}
      <span className="grid grid-cols-2 gap-md">
        <Text variant="small" className="text-muted-foreground">
          {`Ours ${weightOf(candidate.current, unit)} · ${formatRatio(candidate.current.purity)}`}
        </Text>
        <Text variant="small" className="text-muted-foreground">
          {`Refiner ${weightOf(candidate.refiner, unit)} · ${formatRatio(candidate.refiner?.purity)}`}
        </Text>
      </span>
      <span className="grid grid-cols-[110px_94px] gap-xs">
        {weight}
        {purity}
      </span>
    </div>
  )
}

export function AdoptAssayBody({
  candidates,
  layout = 'desktop',
  onFiguresChange,
  lineHref,
}: AdoptAssayBodyProps) {
  const own = candidates.filter((candidate) => (candidate.share ?? 1) >= 1)
  const shared = candidates.filter((candidate) => (candidate.share ?? 1) < 1)
  const section = (title: string, rows: AdoptAssayCandidate[]) =>
    rows.length > 0 && (
      <section aria-label={title} className="flex flex-col gap-md">
        <Text variant="eyebrow">{title}</Text>
        {rows.map((candidate) => (
          <CandidateRow
            key={candidate.id}
            candidate={candidate}
            layout={layout}
            onFiguresChange={onFiguresChange}
            lineHref={lineHref}
          />
        ))}
      </section>
    )

  return (
    <div data-layout={layout} className="flex flex-col gap-md">
      {section('From its own line', own)}
      {own.length > 0 && shared.length > 0 && <Divider />}
      {section('From a shared line', shared)}
    </div>
  )
}
