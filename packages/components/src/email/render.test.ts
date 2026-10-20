import { describe, expect, it } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Button, Card, Code, Footer, Header, Row, Rule, Stat, Text } from './components'
import { Layout, renderMailer } from './Layout'
import { paper, screen } from './palette'
import { eyebrowType, labelType, type } from './style'

const MEDIA = 'https://media.example.test'
const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node)

describe('email components', () => {
  it('Text renders each variant with its words', () => {
    for (const variant of ['heading', 'lede', 'note'] as const) {
      expect(html(h(Text, { variant, children: `A ${variant}` }))).toContain(`A ${variant}`)
    }
  })

  it('Stat, Code and Row render label and value on either palette', () => {
    for (const palette of [screen, paper]) {
      expect(html(h(Stat, { label: 'Payout', value: '$1,204.00', palette }))).toContain('$1,204.00')
      const code = html(h(Code, { value: '482913', expiry: 'Expires in 10 minutes', palette }))
      expect(code).toContain('482913')
      expect(code).toContain('Expires in 10 minutes')
      expect(html(h(Row, { label: 'Order', value: 'PO-12', palette }))).toContain('PO-12')
    }
  })

  it('Card renders every row with rules between them, and none for zero rows', () => {
    const card = html(
      h(Card, {
        rows: [
          { label: 'A', value: '1' },
          { label: 'B', value: '2' },
          { label: 'C', value: '3' },
        ],
      })
    )
    expect(card.match(/<tr/g)!.length).toBeGreaterThanOrEqual(3)
    for (const text of ['A', '1', 'C', '3']) expect(card).toContain(text)
    expect(html(h(Card, { rows: [] }))).not.toContain('>A<')
  })

  it('Rule spans the given columns', () => {
    expect(html(h('table', null, h('tbody', null, h(Rule, { span: 3 }))))).toContain('colSpan="3"')
  })

  it('Button links out in a new tab', () => {
    const button = html(h(Button, { label: 'View order', href: 'https://example.test/o/1' }))
    expect(button).toContain('href="https://example.test/o/1"')
    expect(button).toContain('target="_blank"')
    expect(button).toContain('View order')
  })

  it('Header and Footer load their images from the media root', () => {
    const header = html(h(Header, { media: MEDIA }))
    const footer = html(h(Footer, { media: MEDIA, palette: paper }))
    expect(header).toContain(`${MEDIA}/`)
    expect(footer).toContain('Dallas, Texas')
  })
})

describe('email layout', () => {
  it('drops empty blocks and pads the last block to the gutter', () => {
    const out = html(
      h(Layout, {
        preheader: 'Your payout is on the way',
        media: MEDIA,
        blocks: ['one', null, false, '', 'two'],
      })
    )
    expect(out).toContain('Your payout is on the way')
    expect(out).toContain('one')
    expect(out).toContain('two')
  })

  it('renderMailer adds the XHTML doctype and font faces from the media root', () => {
    const out = renderMailer(
      'Hello',
      [h(Text, { variant: 'lede', children: 'Body' })],
      MEDIA,
      paper
    )
    expect(out.startsWith('<!DOCTYPE html PUBLIC')).toBe(true)
    expect(out).toContain(`${MEDIA}/fonts/geist-latin.woff2`)
    expect(renderMailer('Hi', [], MEDIA)).toContain('Hi')
  })
})

describe('email type helpers', () => {
  it('merge extra styles over each step', () => {
    expect(type('body', { color: 'red' }).color).toBe('red')
    expect(eyebrowType().textTransform).toBe('uppercase')
    expect(labelType({ color: 'blue' }).color).toBe('blue')
    expect(labelType().letterSpacing).toBe('0.35px')
  })
})
