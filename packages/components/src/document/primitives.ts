import { createElement as h, type CSSProperties, type ReactNode } from 'react'
import { paper } from '../email/palette.ts'
import { eyebrowType, fontStack, space, stroke, type } from '../email/style.ts'

export const PAGE = { width: 816, height: 1056, gutter: 72 } as const

const ink = paper.foreground
const muted = paper.muted
const line = paper.border

export const band: CSSProperties = {
  padding: `${space.sm} ${PAGE.gutter}px`,
  backgroundColor: paper.background,
}

export function bandWith(extra: CSSProperties): CSSProperties {
  return { ...band, ...extra }
}

export function Eyebrow({ children, align }: { children: ReactNode; align?: 'right' }): ReactNode {
  return h(
    'p',
    { style: eyebrowType({ color: muted, margin: 0, textAlign: align ?? 'left' }) },
    children
  )
}

export function Rule(props: { weight?: string; color?: string }): ReactNode {
  const { weight, color } = props
  return h('div', {
    style: {
      height: weight ?? stroke.hairline,
      backgroundColor: color ?? line,
      width: '100%',
    },
  })
}

export type Tone = 'ink' | 'muted'

export function Line({
  step,
  children,
  tone = 'muted',
  align,
  weight,
  style,
}: {
  step: 'micro' | 'small' | 'body' | 'h2' | 'h4' | 'h5' | 'stat-sm'
  children: ReactNode
  tone?: Tone
  align?: 'right'
  weight?: number
  style?: CSSProperties
}): ReactNode {
  return h(
    'p',
    {
      style: type(step, {
        margin: 0,
        color: tone === 'ink' ? ink : muted,
        textAlign: align ?? 'left',
        ...(weight === undefined ? {} : { fontWeight: weight }),
        ...style,
      }),
    },
    children
  )
}

export function Dotted({ parts }: { parts: (string | null)[] }): ReactNode {
  const kept = parts.filter((part): part is string => part !== null && part !== '')
  return h(Line, { step: 'micro', children: kept.join(' · ') })
}

export function Header({ kind, reference }: { kind: string; reference: string }): ReactNode {
  return h(
    'header',
    { style: { ...band, padding: `${space.lg} ${PAGE.gutter}px` } },
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h(Line, { step: 'h4', tone: 'ink', children: 'Dorado Metals Exchange' }),
      h(
        'div',
        { style: { textAlign: 'right' } },
        h(Eyebrow, { align: 'right', children: kind }),
        h(Line, { step: 'small', tone: 'ink', align: 'right', weight: 500, children: reference })
      )
    ),
    h('div', { style: { paddingTop: space.lg } }, h(Rule, {}))
  )
}

export function Footer({
  issued,
  page = 'Page 1 of 1',
}: {
  issued: string
  page?: string
}): ReactNode {
  return h(
    'footer',
    { style: { ...band, padding: `${space.lg} ${PAGE.gutter}px` } },
    h(Rule, {}),
    h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: space.md,
        },
      },
      h(Line, { step: 'micro', children: issued }),
      h(Line, { step: 'micro', align: 'right', children: page })
    )
  )
}

export function Hero({
  label,
  value,
  status,
}: {
  label: string
  value: string
  status: string
}): ReactNode {
  return h(
    'section',
    { style: band },
    h(Eyebrow, { children: label }),
    h(Line, { step: 'stat-sm', tone: 'ink', style: { paddingTop: '4px' }, children: value }),
    h(Line, { step: 'small', style: { paddingTop: '4px' }, children: status })
  )
}

export type TableRow = { name: string; figure: string; facts: (string | null)[] }

export function Table({
  cap,
  column,
  rows,
}: {
  cap: string
  column: string
  rows: TableRow[]
}): ReactNode {
  return h(
    'section',
    { style: band },
    h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          paddingTop: space.xs,
        },
      },
      h(Eyebrow, { children: cap }),
      h(Eyebrow, { align: 'right', children: column })
    ),
    h(Rule, {}),
    ...rows.flatMap((row, i) => [
      h(
        'div',
        { key: `row${i}`, style: { padding: '9px 0' } },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '14px' } },
          h(
            'div',
            { style: { flex: '1 0 0', minWidth: 0 } },
            h(Line, { step: 'small', tone: 'ink', weight: 500, children: row.name })
          ),
          h(
            'div',
            { style: { width: '96px' } },
            h(Line, {
              step: 'small',
              tone: 'ink',
              weight: 500,
              align: 'right',
              children: row.figure,
            })
          )
        ),
        h('div', { style: { paddingTop: '3px' } }, h(Dotted, { parts: row.facts }))
      ),
      h(Rule, { key: `rule${i}` }),
    ])
  )
}

export type LedgerLine = { label: string; value: string }

export function Summary({
  cap = 'Summary',
  lines,
  totalLabel = 'Total',
  total,
}: {
  cap?: string
  lines: LedgerLine[]
  totalLabel?: string
  total: string
}): ReactNode {
  return h(
    'section',
    { style: band },
    h(
      'div',
      { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' } },
      h('div', { style: { flex: '1 0 0', minWidth: 0 } }, h(Eyebrow, { children: cap })),
      h(
        'div',
        { style: { width: '320px' } },
        ...lines.map((entry, i) =>
          h(
            'div',
            {
              key: entry.label + i,
              style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: `${space.xs} 0`,
              },
            },
            h(Line, { step: 'small', children: entry.label }),
            h(Line, { step: 'small', tone: 'ink', align: 'right', children: entry.value })
          )
        ),
        h(Rule, { weight: stroke.emphasis, color: ink }),
        h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: space.sm,
            },
          },
          h(Line, { step: 'small', tone: 'ink', weight: 500, children: totalLabel }),
          h(Line, { step: 'h4', tone: 'ink', align: 'right', children: total })
        )
      )
    )
  )
}

export type EndBlock = {
  label: string
  who: string
  lines: (string | null)[]
  strong?: string | null
}

function End({ block, align }: { block: EndBlock; align?: 'right' }): ReactNode {
  return h(
    'div',
    { style: { textAlign: align ?? 'left' } },
    h(
      'p',
      {
        style: {
          ...type('micro', {
            margin: 0,
            color: muted,
            fontSize: '14px',
            lineHeight: '21px',
            fontWeight: 600,
          }),
          textAlign: align ?? 'left',
        },
      },
      block.label
    ),
    h(Line, {
      step: 'h4',
      tone: 'ink',
      align,
      style: { paddingTop: space['2xs'] },
      children: block.who,
    }),
    ...(block.strong
      ? [h(Line, { step: 'small', align, weight: 500, children: block.strong })]
      : []),
    ...block.lines
      .filter((value): value is string => value !== null && value !== '')
      .map((value, i) => h(Line, { key: i, step: 'micro', align, children: value }))
  )
}

export function Pair({
  cap,
  facts = [],
  left,
  right,
  connector = false,
}: {
  cap: string
  facts?: (string | null)[]
  left: EndBlock
  right: EndBlock
  connector?: boolean
}): ReactNode {
  return h(
    'section',
    { style: band },
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h(Eyebrow, { children: cap }),
      h(Dotted, { parts: facts })
    ),
    h('div', { style: { paddingTop: space['3xs'] } }, h(Rule, {})),
    h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: space.lg,
          paddingTop: space.sm,
        },
      },
      h(End, { block: left }),
      connector
        ? h('div', { style: { width: '140px', paddingTop: '30px' } }, h(Rule, {}))
        : h('div', { style: { flex: '1 0 0', minWidth: 0 } }),
      h(End, { block: right, align: 'right' })
    )
  )
}

export type Step = { title: string; body: string }

export function Instructions({
  lead,
  sub,
  stepsCap,
  steps,
  asideCap,
  aside,
  closingCap,
  stages,
}: {
  lead: string
  sub: string
  stepsCap: string
  steps: Step[]
  asideCap: string
  aside: Step[]
  closingCap: string
  stages: Step[]
}): ReactNode {
  return h(
    'section',
    { style: { ...band, padding: `0 ${PAGE.gutter}px` } },
    h(Line, { step: 'h2', tone: 'ink', children: lead }),
    h(Line, {
      step: 'body',
      style: { paddingTop: space.sm, paddingBottom: space.md },
      children: sub,
    }),
    h(Rule, {}),
    h(
      'div',
      { style: { display: 'flex', gap: '28px', paddingTop: space.md, paddingBottom: space.lg } },
      h(
        'div',
        { style: { flex: '1 0 0', minWidth: 0 } },
        h(Eyebrow, { children: stepsCap }),
        ...steps.flatMap((step, i) => [
          h(
            'div',
            {
              key: `s${i}`,
              style: { display: 'flex', gap: '12px', alignItems: 'baseline', paddingTop: space.md },
            },
            h(
              'p',
              { style: eyebrowType({ color: muted, margin: 0 }) },
              String(i + 1).padStart(2, '0')
            ),
            h(Line, { step: 'h5', tone: 'ink', children: step.title })
          ),
          h(
            'div',
            { key: `sb${i}`, style: { paddingTop: space['2xs'] } },
            h(Line, { step: 'small', children: step.body })
          ),
        ])
      ),
      h('div', { style: { width: '1px', alignSelf: 'stretch', backgroundColor: line } }),
      h(
        'div',
        { style: { width: '232px', flex: '0 0 232px' } },
        h(Eyebrow, { children: asideCap }),
        ...aside.flatMap((entry, i) => [
          h(
            'div',
            { key: `a${i}`, style: { paddingTop: i === 0 ? space.md : space.sm } },
            h(Line, { step: 'small', tone: 'ink', weight: 500, children: entry.title })
          ),
          h(
            'div',
            { key: `ab${i}`, style: { paddingTop: space['2xs'] } },
            h(Line, { step: 'micro', children: entry.body })
          ),
        ])
      )
    ),
    h(Rule, {}),
    h('div', { style: { paddingTop: space.md } }, h(Eyebrow, { children: closingCap })),
    h(
      'div',
      { style: { display: 'flex', gap: space.lg, paddingTop: space.sm } },
      ...stages.map((stage, i) =>
        h(
          'div',
          { key: i, style: { flex: '1 0 0', minWidth: 0 } },
          h(Line, { step: 'small', tone: 'ink', weight: 500, children: stage.title }),
          h(
            'div',
            { style: { paddingTop: '4px' } },
            h(Line, { step: 'micro', children: stage.body })
          )
        )
      )
    )
  )
}

export const pagePalette = paper
export const pageFont = fontStack
