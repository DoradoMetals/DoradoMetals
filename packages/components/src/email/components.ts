import { createElement as h, type CSSProperties, type ReactNode } from 'react'
import { screen, type Palette } from './palette.ts'
import { GUTTER, WIDTH, eyebrowType, radius, space, type } from './style.ts'

export const LOGO_URL = 'https://www.doradometals.com/icons/branding/full/full.png'
const SOCIAL_BASE = 'https://www.doradometals.com/icons/social_media/white'
const SITE = 'https://www.doradometals.com'
export const NBSP = '\u00a0'
const POSTAL = 'Dorado Metals Exchange · 3198 Royal Lane, Suite 209, Dallas, Texas 75229'

type WithPalette = { palette?: Palette }

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

/** A hairline. One definition; the header and the footer draw the same one. */
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

export type TextVariant = 'eyebrow' | 'heading' | 'lede' | 'note'

export function Text({
  variant,
  children,
  palette = screen,
}: WithPalette & { variant: TextVariant; children: string }): ReactNode {
  const align = variant === 'note' ? 'left' : 'center'
  const style: CSSProperties =
    variant === 'heading'
      ? type('h3', { color: palette.foreground, textAlign: align })
      : type('micro', { color: palette.muted, textAlign: align })
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
    h('div', { style: eyebrowType({ color: palette.muted, paddingBottom: space['2xs'] }) }, label),
    h('div', { style: type('h1', { color: palette.foreground }) }, value)
  )
}

export function Code({
  value,
  expiry,
  palette = screen,
}: WithPalette & { value: string; expiry: string }): ReactNode {
  return table(
    {
      backgroundColor: palette.card,
      border: `1px solid ${palette.border}`,
      borderRadius: radius,
    },
    h(
      'tr',
      null,
      h(
        'td',
        { align: 'center', style: { padding: space.lg } },
        h(
          'div',
          {
            style: type('h1', {
              color: palette.foreground,
              fontSize: '40px',
              lineHeight: '48px',
              letterSpacing: '8px',
            }),
          },
          value
        ),
        h('div', { style: type('micro', { color: palette.muted, paddingTop: space.xs }) }, expiry)
      )
    ),
    { bgcolor: palette.card }
  )
}

export type RowEntry = { label: string; value: string }

/** Label left, figure right, so a column of them reads down the right edge. */
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
        style: type('micro', {
          color: palette.foreground,
          padding: `${space.xs} 0`,
          textAlign: 'right',
        }),
      },
      value
    )
  )
}

/** Fewer than three rows is expected; an empty list renders no box at all. */
export function Card({ rows, palette = screen }: WithPalette & { rows: RowEntry[] }): ReactNode {
  if (rows.length === 0) return null
  const body = rows.flatMap((entry, i) => [
    ...(i === 0 ? [] : [h(Rule, { key: `r${i}`, palette, span: 2 })]),
    h(Row, { key: entry.label + i, palette, ...entry }),
  ])
  return table(
    { backgroundColor: palette.card, border: `1px solid ${palette.border}`, borderRadius: radius },
    h('tr', null, h('td', { style: { padding: `${space['2xs']} 20px` } }, table({}, body))),
    { bgcolor: palette.card }
  )
}

export function Button({
  label,
  href,
  palette = screen,
}: WithPalette & { label: string; href: string }): ReactNode {
  return h(
    'table',
    { role: 'presentation', cellPadding: 0, cellSpacing: 0, border: 0 },
    h(
      'tbody',
      null,
      h(
        'tr',
        null,
        h(
          'td',
          {
            bgcolor: palette.primary,
            style: { backgroundColor: palette.primary, borderRadius: radius },
          },
          h(
            'a',
            {
              href,
              target: '_blank',
              style: type('small', {
                display: 'inline-block',
                fontWeight: 500,
                color: palette.onPrimary,
                textDecoration: 'none',
                padding: `10px ${space.md}`,
                lineHeight: '20px',
              }),
            },
            label
          )
        )
      )
    )
  )
}

export function Header({ palette = screen }: WithPalette): ReactNode {
  return h(
    'tbody',
    null,
    h(
      'tr',
      null,
      h(
        'td',
        {
          align: 'center',
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
            src: LOGO_URL,
            width: '160',
            alt: 'Dorado Metals Exchange',
            loading: 'lazy',
            style: {
              display: 'block',
              width: '160px',
              maxWidth: '160px',
              height: 'auto',
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

function socialIcon(name: string, href: string, alt: string): ReactNode {
  return h(
    'td',
    { key: name, style: { padding: `0 ${space.xs}` } },
    h(
      'a',
      { href, target: '_blank', style: { textDecoration: 'none' } },
      h('img', {
        src: `${SOCIAL_BASE}/${name}.png`,
        width: '16',
        height: '16',
        alt,
        loading: 'lazy',
        style: { display: 'block', width: '16px', height: '16px', border: 0 },
      })
    )
  )
}

const LEGAL: Array<[string, string]> = [
  ['Privacy', `${SITE}/privacy-policy`],
  ['Terms', `${SITE}/terms-and-conditions`],
  ['Unsubscribe', `${SITE}/account?tab=notifications`],
]

export function Footer({ palette = screen }: WithPalette): ReactNode {
  const micro = type('micro', { color: palette.muted })
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
          style: {
            backgroundColor: palette.background,
            padding: `0 ${GUTTER} ${GUTTER} ${GUTTER}`,
          },
        },
        table({}, [
          h(Rule, { key: 'rule', palette }),
          h(
            'tr',
            { key: 'social' },
            h(
              'td',
              { align: 'center', style: { paddingTop: space.md } },
              h(
                'table',
                { role: 'presentation', cellPadding: 0, cellSpacing: 0, border: 0 },
                h(
                  'tbody',
                  null,
                  h(
                    'tr',
                    null,
                    socialIcon('instagram', 'https://www.instagram.com/doradometals/', 'Instagram'),
                    socialIcon(
                      'facebook',
                      'https://www.facebook.com/people/Dorado-Metals/61576361032653/',
                      'Facebook'
                    ),
                    socialIcon('x', 'https://x.com/DoradoMetals', 'X')
                  )
                )
              )
            )
          ),
          h(
            'tr',
            { key: 'postal' },
            h('td', { align: 'center', style: { ...micro, paddingTop: space.md } }, POSTAL)
          ),
          h(
            'tr',
            { key: 'legal' },
            h(
              'td',
              { align: 'center', style: { paddingTop: space.md } },
              LEGAL.flatMap(([label, href], i) => [
                ...(i === 0
                  ? []
                  : [
                      h(
                        'span',
                        { key: `gap${i}`, style: type('small', { color: palette.muted }) },
                        '  '
                      ),
                    ]),
                h('a', { key: label, href, target: '_blank', style: link }, label),
              ])
            )
          ),
          h(
            'tr',
            { key: 'why' },
            h(
              'td',
              { align: 'center', style: { ...micro, paddingTop: space.md } },
              'You’re receiving this because you have an account with Dorado Metals Exchange.'
            )
          ),
        ])
      )
    )
  )
}

export const INNER_WIDTH = String(WIDTH.inner)
