import { createElement as h, type CSSProperties, type ReactNode } from 'react'
import { px } from '@dorado/theme/tokens'
import { paper } from '../email/palette.ts'
import { eyebrowType, fontStack, space, stroke, type } from '../email/style.ts'

const gutter = Number.parseFloat(px('--page-margin-letter'))

export const PAGE = {
  width: 816,
  height: 1056,
  gutter,
  top: Number.parseFloat(space.md),
} as const

export type Density = 'compact' | 'roomy'

const edge = (density: Density): number =>
  Number.parseFloat(density === 'roomy' ? space.lg : space.md)

export const LOGO = { width: 70, height: 35 } as const

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
  step: 'micro' | 'small' | 'body' | 'h2' | 'h3' | 'h4' | 'h5' | 'stat-sm'
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

function Dot({ index }: { index: number }): ReactNode {
  return h(
    'span',
    {
      key: `dot${index}`,
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: space.lg,
        height: space.lg,
        flex: `0 0 ${space.lg}`,
      },
    },
    h('span', {
      style: { width: '4px', height: '4px', borderRadius: '2px', backgroundColor: muted },
    })
  )
}

export function Dotted({ parts, align }: { parts: (string | null)[]; align?: 'right' }): ReactNode {
  const kept = parts.filter((part): part is string => part !== null && part !== '')
  if (kept.length === 0) return null
  return h(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        gap: '2px',
        minHeight: space.lg,
      },
    },
    ...kept.flatMap((part, i) => [
      ...(i === 0 ? [] : [h(Dot, { key: `d${i}`, index: i })]),
      h(
        'span',
        { key: `p${i}`, style: type('micro', { color: muted, whiteSpace: 'nowrap' }) },
        part
      ),
    ])
  )
}

export type Checkout = { title: string; note: string; qr: string }

export const HEADER_QR = 48

function Titles({ kind, reference }: { kind: string; reference: string | null }): ReactNode {
  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' } },
    h(Eyebrow, { align: 'right', children: kind }),
    ...(reference === null
      ? []
      : [
          h(Line, {
            key: 'reference',
            step: 'small',
            tone: 'ink',
            align: 'right',
            weight: 500,
            children: reference,
          }),
        ])
  )
}

export function Header({
  kind,
  reference,
  logo,
  density = 'compact',
  checkout,
}: {
  kind: string
  reference: string | null
  logo: string
  density?: Density
  checkout?: Checkout | null
}): ReactNode {
  const pad = edge(density)
  return h(
    'header',
    {
      style: {
        ...band,
        padding: `${pad - PAGE.top}px ${PAGE.gutter}px ${pad}px`,
      },
    },
    h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
      },
      h('img', {
        src: logo,
        width: LOGO.width,
        height: LOGO.height,
        alt: 'Dorado Metals Exchange',
        style: { display: 'block', width: `${LOGO.width}px`, height: `${LOGO.height}px` },
      }),
      checkout
        ? h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: space.sm } },
            h(Titles, { kind: checkout.title, reference: checkout.note }),
            h('img', {
              src: checkout.qr,
              width: HEADER_QR,
              height: HEADER_QR,
              alt: '',
              style: { display: 'block', width: `${HEADER_QR}px`, height: `${HEADER_QR}px` },
            })
          )
        : h(Titles, { kind, reference })
    ),
    h('div', { style: { paddingTop: space.lg } }, h(Rule, {}))
  )
}

export const PAGE_NUMBER = 'pageNumber'
export const TOTAL_PAGES = 'totalPages'

const CONTACT_HEIGHT = Number.parseFloat(space.lg)

export function footerHeight(density: Density, contact = false): number {
  return edge(density) * 2 + 1 + Number.parseFloat(space.md) + 18 + (contact ? CONTACT_HEIGHT : 0)
}

function ContactLine({ parts }: { parts: string[] }): ReactNode {
  return h(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: `${CONTACT_HEIGHT}px`,
      },
    },
    ...parts.flatMap((part, i) => [
      ...(i === 0 ? [] : [h(Dot, { key: `d${i}`, index: i })]),
      h(
        'span',
        { key: `c${i}`, style: type('micro', { color: muted, whiteSpace: 'nowrap' }) },
        part
      ),
    ])
  )
}

export function Footer({
  issued,
  density = 'compact',
  contact = [],
}: {
  issued: string
  density?: Density
  contact?: string[]
}): ReactNode {
  const pad = edge(density)
  const micro = type('micro', { color: muted, margin: 0 })
  return h(
    'div',
    {
      style: {
        width: `${PAGE.width}px`,
        height: `${footerHeight(density, contact.length > 0)}px`,
        boxSizing: 'border-box',
        padding: `${pad}px ${PAGE.gutter}px`,
        backgroundColor: paper.background,
        fontFamily: fontStack,
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      },
    },
    h('div', { style: { height: stroke.hairline, backgroundColor: line } }),
    ...(contact.length > 0 ? [h(ContactLine, { key: 'contact', parts: contact })] : []),
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
      h('p', { style: micro }, issued),
      h(
        'p',
        { style: { ...micro, textAlign: 'right' } },
        'Page ',
        h('span', { className: PAGE_NUMBER }),
        ' of ',
        h('span', { className: TOTAL_PAGES })
      )
    )
  )
}

export function NoteFooter({ note }: { note: string }): ReactNode {
  return h(
    'div',
    {
      style: {
        width: `${PAGE.width}px`,
        height: '100px',
        boxSizing: 'border-box',
        padding: `${space.lg} ${PAGE.gutter}px`,
        backgroundColor: paper.background,
        fontFamily: fontStack,
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      },
    },
    h('div', { style: { height: stroke.hairline, backgroundColor: line } }),
    h('p', { style: type('micro', { color: muted, margin: 0, paddingTop: space.md }) }, note)
  )
}

export type HeroReference = { number: string; customer: string | null }

export function Hero({
  label,
  value,
  status,
  reference = null,
}: {
  label: string
  value: string
  status: string
  reference?: HeroReference | null
}): ReactNode {
  return h(
    'section',
    { style: bandWith({ paddingTop: space.md }) },
    reference === null
      ? h(Eyebrow, { children: label })
      : h(
          'div',
          { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' } },
          h(Eyebrow, { children: label }),
          h(
            'div',
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '2px',
              },
            },
            h(Eyebrow, { align: 'right', children: reference.number }),
            ...(reference.customer
              ? [
                  h(Line, {
                    key: 'for',
                    step: 'small',
                    align: 'right',
                    children: reference.customer,
                  }),
                ]
              : [])
          )
        ),
    h(Line, { step: 'stat-sm', tone: 'ink', style: { paddingTop: space['2xs'] }, children: value }),
    h(Line, { step: 'small', style: { paddingTop: space['2xs'] }, children: status })
  )
}

export type TableRow = { name: string; figure: string; facts: (string | null)[] }

export function Table({
  cap,
  column,
  rows,
  closed = true,
}: {
  cap: string
  column: string
  rows: TableRow[]
  closed?: boolean
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
          gap: '14px',
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
        {
          key: `row${i}`,
          style: {
            padding: `${space.xs} 0`,
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            breakInside: 'avoid',
          },
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '14px' } },
          h(
            'div',
            { style: { flex: '1 0 0', minWidth: 0 } },
            h(Line, { step: 'small', tone: 'ink', weight: 500, children: row.name })
          ),
          h(Line, {
            step: 'small',
            tone: 'ink',
            weight: 500,
            align: 'right',
            style: { whiteSpace: 'nowrap' },
            children: row.figure,
          })
        ),
        h(Dotted, { parts: row.facts })
      ),
      ...(closed || i < rows.length - 1 ? [h(Rule, { key: `rule${i}` })] : []),
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
    { style: bandWith({ breakInside: 'avoid' }) },
    h(
      'div',
      { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' } },
      h('div', { style: { flex: '1 0 0', minWidth: 0 } }, h(Eyebrow, { children: cap })),
      h(
        'div',
        { style: { width: '320px', display: 'flex', flexDirection: 'column', gap: space.xs } },
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
        h(Rule, { weight: stroke.heavy, color: ink }),
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
    {
      style: {
        textAlign: align ?? 'left',
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'right' ? 'flex-end' : 'flex-start',
        gap: '2px',
      },
    },
    h(
      'p',
      {
        style: type('micro', {
          margin: 0,
          color: muted,
          fontSize: '14px',
          lineHeight: '21px',
          letterSpacing: '0px',
          fontWeight: 600,
          textAlign: align ?? 'left',
        }),
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
      ? [h(Line, { key: 'strong', step: 'small', align, weight: 500, children: block.strong })]
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
    { style: bandWith({ breakInside: 'avoid' }) },
    h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space.md,
          minHeight: '18px',
        },
      },
      h(Eyebrow, { children: cap }),
      h(Dotted, { parts: facts, align: 'right' })
    ),
    h('div', { style: { paddingTop: '2px', paddingBottom: '2px' } }, h(Rule, {})),
    h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: connector ? 'center' : 'flex-start',
          justifyContent: 'space-between',
          gap: space.lg,
          paddingTop: space.sm,
          minHeight: '112px',
        },
      },
      h(End, { block: left }),
      connector
        ? h('div', { style: { width: '140px', paddingTop: space.xl } }, h(Rule, {}))
        : h('div', { style: { flex: '1 0 0', minWidth: 0 } }),
      h(End, { block: right, align: connector ? undefined : 'right' })
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
    { style: { ...band, padding: `0 ${PAGE.gutter}px 10px` } },
    h(Line, { step: 'h2', tone: 'ink', children: lead }),
    h(Line, {
      step: 'body',
      style: { paddingTop: space.sm, paddingBottom: space.md },
      children: sub,
    }),
    h(Rule, {}),
    h(
      'div',
      {
        style: {
          display: 'flex',
          gap: space.lg,
          paddingTop: space.md,
          paddingBottom: space.lg,
          breakInside: 'avoid',
        },
      },
      h(
        'div',
        { style: { flex: '1 0 0', minWidth: 0 } },
        h(Eyebrow, { children: stepsCap }),
        ...steps.flatMap((step, i) => [
          h(
            'div',
            {
              key: `s${i}`,
              style: { display: 'flex', gap: space.sm, alignItems: 'center', paddingTop: space.md },
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
      { style: { display: 'flex', gap: space.lg, paddingTop: space.sm, breakInside: 'avoid' } },
      ...stages.map((stage, i) =>
        h(
          'div',
          { key: i, style: { flex: '1 0 0', minWidth: 0 } },
          h(Line, { step: 'small', tone: 'ink', weight: 500, children: stage.title }),
          h(
            'div',
            { style: { paddingTop: space['2xs'] } },
            h(Line, { step: 'micro', children: stage.body })
          )
        )
      )
    )
  )
}

export const pagePalette = paper
export const pageFont = fontStack
