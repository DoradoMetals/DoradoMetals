'use client'

import * as React from 'react'
import {
  Alert,
  Button,
  Divider,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  ItemDetails,
  Select,
  Skeleton,
  cn,
} from '@dorado/components'
import type {
  RefiningLotView,
  RefiningSettlementLot,
  SettlementParse,
  SettlementParseLine,
  SettlementParseNotOnInvoice,
} from '@dorado/contracts'

import { formatPurity, formatWeight } from '../../_lib'

export type MatchLinesPick = Pick<RefiningSettlementLot, 'lot_id' | 'line_reference'>

export type MatchLinesDrawerProps = {
  open: boolean
  setOpen: (open: boolean) => void
  parse?: SettlementParse
  lots: RefiningLotView[]
  content?: 'loaded' | 'loading' | 'error'
  layout?: 'desktop' | 'mobile'
  onApply: (picks: MatchLinesPick[]) => void
  onRetry?: () => void
}

const NONE = '__none__'

const fineOz = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
})

const ounces = (value: number | null, estimate = false): string =>
  value == null ? '—' : `${fineOz.format(value)} oz${estimate ? ' est.' : ''}`

const lotLabel = (lot: RefiningLotView): string =>
  [lot.lot.reference, lot.lot.product_name ?? lot.lot.metal_id].filter(Boolean).join(' · ')

function seed(parse: SettlementParse | undefined): Record<string, string | null> {
  const picks: Record<string, string | null> = {}
  for (const line of parse?.lines ?? []) picks[line.line_reference] = line.suggested_lot_id
  return picks
}

function Row({
  mobile,
  details,
  oz,
  control,
}: {
  mobile: boolean
  details: React.ReactNode
  oz: string
  control?: React.ReactNode
}) {
  return (
    <li
      data-row
      className={cn('flex gap-sm', mobile ? 'flex-col gap-xs' : 'flex-row items-center')}
    >
      <div className={cn('flex min-w-0 items-center gap-sm', !mobile && 'flex-1')}>
        {details}
        <span className="text-small text-foreground">{oz}</span>
      </div>
      <div className={cn(mobile ? 'w-full' : 'w-[330px] shrink-0')}>{control}</div>
    </li>
  )
}

function Section({
  title,
  children,
  first,
}: {
  title: string
  children: React.ReactNode
  first: boolean
}) {
  return (
    <>
      {first ? null : <Divider />}
      <section aria-label={title} className="flex flex-col gap-xs-plus">
        <p className="eyebrow text-muted-foreground">{title.toUpperCase()}</p>
        <ul className="flex flex-col gap-xs-plus">{children}</ul>
      </section>
    </>
  )
}

export function MatchLinesDrawer({
  open,
  setOpen,
  parse,
  lots,
  content = 'loaded',
  layout = 'desktop',
  onApply,
  onRetry,
}: MatchLinesDrawerProps) {
  const mobile = layout === 'mobile'
  const [picks, setPicks] = React.useState<Record<string, string | null>>(() => seed(parse))

  React.useEffect(() => {
    if (open) setPicks(seed(parse))
  }, [open, parse])

  const lotItems = lots.map((lot) => ({ value: lot.lot_id, label: lotLabel(lot) }))
  const lines = parse?.lines ?? []
  const matched = lines.filter((line) => line.status === 'matched')
  const unmatched = lines.filter((line) => line.status === 'unmatched')
  const extra = lines.filter((line) => line.status === 'extra')
  const missing = parse?.not_on_invoice ?? []
  const openLines = lines.filter((line) => line.status !== 'matched')
  const ready = content === 'loaded' && parse !== undefined && parse.supported

  const pickLot = (line: string, lot: string) =>
    setPicks((current) => ({ ...current, [line]: lot === NONE ? null : lot }))

  const pickLine = (lot: string, line: string) =>
    setPicks((current) => {
      const next: Record<string, string | null> = {}
      for (const [key, value] of Object.entries(current)) next[key] = value === lot ? null : value
      if (line !== NONE) next[line] = lot
      return next
    })

  const lineDetails = (line: SettlementParseLine) => (
    <ItemDetails
      tone="muted"
      leading="name"
      name={line.line_reference}
      weight={formatWeight(line.weight, line.unit)}
      purity={formatPurity(line.purity)}
    />
  )

  const lotControl = (line: SettlementParseLine) => (
    <Select
      label="Our lot"
      placeholder="Choose a lot"
      items={[{ value: NONE, label: 'No lot' }, ...lotItems]}
      value={picks[line.line_reference] ?? ''}
      onValueChange={(value) => pickLot(line.line_reference, value)}
    />
  )

  const lineControl = (row: SettlementParseNotOnInvoice) => {
    const held = Object.entries(picks).find(([, lot]) => lot === row.lot_id)?.[0]
    return (
      <Select
        label="Our lot"
        placeholder="Attach an invoice line"
        items={[
          { value: NONE, label: 'No line' },
          ...openLines.map((line) => ({ value: line.line_reference, label: line.line_reference })),
        ]}
        value={held ?? ''}
        onValueChange={(value) => pickLine(row.lot_id, value)}
      />
    )
  }

  const sections = [
    matched.length > 0 && {
      title: 'Matched',
      rows: matched.map((line) => (
        <Row
          key={line.line_reference}
          mobile={mobile}
          details={lineDetails(line)}
          oz={ounces(line.fine_oz)}
          control={lotControl(line)}
        />
      )),
    },
    unmatched.length > 0 && {
      title: 'Unmatched',
      rows: unmatched.map((line) => (
        <Row
          key={line.line_reference}
          mobile={mobile}
          details={lineDetails(line)}
          oz={ounces(line.fine_oz)}
          control={lotControl(line)}
        />
      )),
    },
    missing.length > 0 && {
      title: 'Not on invoice',
      rows: missing.map((row) => (
        <Row
          key={row.lot_id}
          mobile={mobile}
          details={<ItemDetails tone="muted" leading="name" name={row.reference} />}
          oz={ounces(row.fine_oz, true)}
          control={lineControl(row)}
        />
      )),
    },
    extra.length > 0 && {
      title: 'Extra on invoice',
      rows: extra.map((line) => (
        <Row
          key={line.line_reference}
          mobile={mobile}
          details={lineDetails(line)}
          oz={ounces(line.fine_oz)}
        />
      )),
    },
  ].filter((section): section is { title: string; rows: React.ReactElement[] } => !!section)

  const apply = () =>
    onApply(
      Object.entries(picks)
        .filter((entry): entry is [string, string] => entry[1] !== null)
        .map(([line_reference, lot_id]) => ({ lot_id, line_reference }))
    )

  return (
    <Drawer
      open={open}
      setOpen={setOpen}
      size={mobile ? 'full' : 'md'}
      label="Match settlement lines"
    >
      <div data-layout={layout} className="contents">
        <DrawerHeader title="Match settlement lines" />
        <DrawerBody className="gap-md">
          {content === 'loading' && (
            <div role="status" aria-label="Reading the statement" className="flex flex-col gap-md">
              <Skeleton className="w-full" />
              <Skeleton className="w-[70%]" />
              <Skeleton className="w-[45%]" />
            </div>
          )}
          {content === 'error' && (
            <div className="flex flex-col items-start gap-sm">
              <Alert intent="danger" title="Couldn’t read the statement" className="w-full">
                Check your connection, then try again.
              </Alert>
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Try again
              </Button>
            </div>
          )}
          {content === 'loaded' && parse !== undefined && !parse.supported && (
            <Alert intent="warning" title="This statement format is not supported">
              Enter each lot’s figures in Record settlement instead.
            </Alert>
          )}
          {ready &&
            sections.map((section, index) => (
              <Section key={section.title} title={section.title} first={index === 0}>
                {section.rows}
              </Section>
            ))}
        </DrawerBody>
        <DrawerFooter className={mobile ? 'sm:flex-col-reverse sm:items-stretch' : undefined}>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ready} onClick={apply}>
            Apply matches
          </Button>
        </DrawerFooter>
      </div>
    </Drawer>
  )
}
