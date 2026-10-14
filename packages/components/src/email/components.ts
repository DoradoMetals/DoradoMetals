import { createElement as h, type CSSProperties, type ReactNode } from 'react'
import { screen, type Palette } from './palette.ts'
import { GUTTER, WIDTH, labelType, radius, space, type } from './style.ts'

const SITE = 'https://www.doradometals.com'
export const NBSP = ' '
const POSTAL = 'Dorado Metals Exchange · 3198 Royal Lane, Suite 209, Dallas, Texas 75229'
export const LOGO = { file: 'email-logo.png', width: 96, height: 47 } as const
const ICON = { cell: 32, image: 24 } as const

type WithPalette = { palette?: Palette }
type WithMedia = { media: string }

function table(
  style: CSSProperties,
  children: ReactNode,
  extra: Record<string, unknown> = {}
): ReactNode {
  return h(
    'table',
    {
      role: 'presentation',
      width: '100%',
      cellPadding: 0,
      cellSpacing: 0,
      border: 0,
      style,
      ...extra,
    },
    h('tbody', null, children)
  )
}

function boxed(palette: Palette, children: ReactNode): ReactNode {
  return h(
    'div',
    {
      style: {
        backgroundColor: palette.card,
        border: `1px solid ${palette.border}`,
        borderRadius: radius,
        overflow: 'hidden',
      },
    },
    children
  )
}

function spacer(key: string, width: string): ReactNode {
  return h('td', { key, width: width.replace('px', ''), style: { width, fontSize: 0 } }, NBSP)
}

export function Rule({ palette = screen, span = 1 }: WithPalette & { span?: number }): ReactNode {
  return h(
    'tr',
    null,
    h(
      'td',
      {
        colSpan: span,
        height: '1',
        style: { height: '1px', lineHeight: '1px', fontSize: 0, backgroundColor: palette.border },
      },
      NBSP
    )
  )
}

export type TextVariant = 'heading' | 'lede' | 'note'

export function Text({
  variant,
  children,
  palette = screen,
}: WithPalette & { variant: TextVariant; children: string }): ReactNode {
  const style: CSSProperties =
    variant === 'heading'
      ? type('h3', { color: palette.foreground, textAlign: 'left', margin: 0 })
      : type('micro', { color: palette.muted, textAlign: 'left', margin: 0 })
  return h('div', { style }, children)
}

export function Stat({
  label,
  value,
  palette = screen,
}: WithPalette & { label: string; value: string }): ReactNode {
  return h(
    'div',
    null,
    h('div', { style: labelType({ color: palette.muted, paddingBottom: space['2xs'] }) }, label),
    h('div', { style: type('h1', { color: palette.foreground, letterSpacing: '0px' }) }, value)
  )
}

export function Code({
  value,
  expiry,
  palette = screen,
}: WithPalette & { value: string; expiry: string }): ReactNode {
  return boxed(
    palette,
    table(
      {},
      h(
        'tr',
        null,
        h(
          'td',
          { align: 'center', bgcolor: palette.card, style: { padding: space.lg } },
          h(
            'div',
            {
              style: type('h1', {
                color: palette.foreground,
                fontSize: '40px',
                lineHeight: '48px',
                letterSpacing: '8px',
                textAlign: 'center',
              }),
            },
            value
          ),
          h(
            'div',
            {
              style: type('micro', {
                color: palette.muted,
                paddingTop: space.xs,
                textAlign: 'center',
              }),
            },
            expiry
          )
        )
      )
    )
  )
}

export type RowEntry = { label: string; value: string }

export function Row({ label, value, palette = screen }: WithPalette & RowEntry): ReactNode {
  return h(
    'tr',
    null,
    h(
      'td',
      {
        style: type('micro', { color: palette.muted, padding: `${space.xs} 0`, textAlign: 'left' }),
      },
      label
    ),
    h(
      'td',
      {
        align: 'right',
        style: type('micro', {
          color: palette.foreground,
          padding: `${space.xs} 0 ${space.xs} ${space.md}`,
          textAlign: 'right',
        }),
      },
      value
    )
  )
}

export function Card({ rows, palette = screen }: WithPalette & { rows: RowEntry[] }): ReactNode {
  if (rows.length === 0) return null
  const body = rows.flatMap((entry, i) => [
    ...(i === 0 ? [] : [h(Rule, { key: `r${i}`, palette, span: 2 })]),
    h(Row, { key: entry.label + i, palette, ...entry }),
  ])
  return boxed(
    palette,
    table(
      {},
      h(
        'tr',
        null,
        h(
          'td',
          { bgcolor: palette.card, style: { padding: `${space['2xs']} 20px` } },
          table({}, body)
        )
      )
    )
  )
}

export function Button({
  label,
  href,
  palette = screen,
}: WithPalette & { label: string; href: string }): ReactNode {
  return table(
    {},
    h(
      'tr',
      null,
      h(
        'td',
        {
          align: 'center',
          bgcolor: palette.primary,
          style: { backgroundColor: palette.primary, borderRadius: radius },
        },
        h(
          'a',
          {
            href,
            target: '_blank',
            style: type('small', {
              display: 'block',
              fontWeight: 500,
              color: palette.onPrimary,
              textDecoration: 'none',
              textAlign: 'center',
              padding: `10px ${space.md}`,
              lineHeight: '20px',
            }),
          },
          label
        )
      )
    )
  )
}

export function Header({ palette = screen, media }: WithPalette & WithMedia): ReactNode {
  return h(
    'tbody',
    null,
    h(
      'tr',
      null,
      h(
        'td',
        {
          align: 'left',
          bgcolor: palette.background,
          style: {
            backgroundColor: palette.background,
            padding: `${GUTTER} ${GUTTER} ${space.md} ${GUTTER}`,
          },
        },
        h(
          'a',
          { href: SITE, target: '_blank', style: { textDecoration: 'none' } },
          h('img', {
            src: `${media}/${LOGO.file}`,
            width: String(LOGO.width),
            height: String(LOGO.height),
            alt: 'Dorado Metals Exchange',
            loading: 'lazy',
            style: {
              display: 'block',
              width: `${LOGO.width}px`,
              height: `${LOGO.height}px`,
              border: 0,
            },
          })
        )
      )
    ),
    h(
      'tr',
      null,
      h(
        'td',
        {
          bgcolor: palette.background,
          style: {
            backgroundColor: palette.background,
            padding: `0 ${GUTTER} ${GUTTER} ${GUTTER}`,
          },
        },
        table({}, h(Rule, { palette }))
      )
    )
  )
}

const SOCIAL: Array<[string, string, string]> = [
  ['instagram', 'https://www.instagram.com/doradometals/', 'Instagram'],
  ['facebook', 'https://www.facebook.com/people/Dorado-Metals/61576361032653/', 'Facebook'],
  ['x', 'https://x.com/DoradoMetals', 'X'],
]

function socialIcon(media: string, [name, href, alt]: [string, string, string]): ReactNode {
  const pad = `${(ICON.cell - ICON.image) / 2}px`
  return h(
    'td',
    { key: name, width: String(ICON.cell), style: { width: `${ICON.image}px`, padding: pad } },
    h(
      'a',
      { href, target: '_blank', style: { textDecoration: 'none' } },
      h('img', {
        src: `${media}/social-${name}.png`,
        width: String(ICON.image),
        height: String(ICON.image),
        alt,
        loading: 'lazy',
        style: {
          display: 'block',
          width: `${ICON.image}px`,
          height: `${ICON.image}px`,
          border: 0,
        },
      })
    )
  )
}

const LEGAL: Array<[string, string]> = [
  ['Privacy', `${SITE}/privacy-policy`],
  ['Terms', `${SITE}/terms-and-conditions`],
  ['Unsubscribe', `${SITE}/account?tab=notifications`],
]

function inline(cells: ReactNode[]): ReactNode {
  return h(
    'table',
    { role: 'presentation', cellPadding: 0, cellSpacing: 0, border: 0 },
    h(
      'tbody',
      null,
      h(
        'tr',
        null,
        cells.flatMap((cell, i) => (i === 0 ? [cell] : [spacer(`gap${i}`, space.md), cell]))
      )
    )
  )
}

export function Footer({ palette = screen, media }: WithPalette & WithMedia): ReactNode {
  const micro = type('micro', { color: palette.muted, textAlign: 'left' })
  const link = type('small', { fontWeight: 500, color: palette.foreground, textDecoration: 'none' })
  return h(
    'tbody',
    null,
    h(
      'tr',
      null,
      h(
        'td',
        {
          bgcolor: palette.background,
          style: { backgroundColor: palette.background, padding: GUTTER },
        },
        table({}, [
          h(Rule, { key: 'rule', palette }),
          h(
            'tr',
            { key: 'social' },
            h(
              'td',
              { align: 'left', style: { paddingTop: space.md } },
              inline(SOCIAL.map((entry) => socialIcon(media, entry)))
            )
          ),
          h(
            'tr',
            { key: 'postal' },
            h('td', { align: 'left', style: { ...micro, paddingTop: space.md } }, POSTAL)
          ),
          h(
            'tr',
            { key: 'legal' },
            h(
              'td',
              { align: 'left', style: { paddingTop: space.md } },
              inline(
                LEGAL.map(([label, href]) =>
                  h('td', { key: label }, h('a', { href, target: '_blank', style: link }, label))
                )
              )
            )
          ),
          h(
            'tr',
            { key: 'why' },
            h(
              'td',
              { align: 'left', style: { ...micro, paddingTop: space.md } },
              'You’re receiving this because you have an account with Dorado Metals Exchange.'
            )
          ),
        ])
      )
    )
  )
}

export const INNER_WIDTH = String(WIDTH.inner)
