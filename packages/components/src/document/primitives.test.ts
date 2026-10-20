import { describe, expect, it } from 'vitest'
import { createElement as h, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  Dotted,
  Eyebrow,
  Footer,
  Header,
  Hero,
  Instructions,
  Line,
  NoteFooter,
  Pair,
  Rule,
  Summary,
  Table,
  bandWith,
  footerHeight,
} from './primitives'
import { renderFramed } from './Page'

const html = (node: ReactNode) => renderToStaticMarkup(h('div', null, node))

describe('document primitives', () => {
  it('Eyebrow, Rule and Line take their alignment, tone and weight', () => {
    expect(html(h(Eyebrow, { align: 'right', children: 'Order' }))).toContain('text-align:right')
    expect(html(h(Eyebrow, { children: 'Order' }))).toContain('text-align:left')
    expect(html(h(Rule, { weight: '2px', color: 'red' }))).toContain('height:2px')
    expect(html(h(Rule, {}))).toContain('width:100%')
    const ink = html(
      h(Line, { step: 'body', tone: 'ink', weight: 600, align: 'right', children: 'Ink' })
    )
    expect(ink).toContain('font-weight:600')
    expect(html(h(Line, { step: 'micro', children: 'Muted' }))).toContain('Muted')
  })

  it('Dotted keeps the non-empty parts with dots between, and is nothing when all are empty', () => {
    const out = html(h(Dotted, { parts: ['PDF', null, '', '2 KB', 'Oct 1'], align: 'right' }))
    expect(out).toContain('PDF')
    expect(out).toContain('Oct 1')
    expect(out).toContain('flex-end')
    expect(html(h(Dotted, { parts: [null, ''] }))).toBe('<div></div>')
  })

  it('Header draws kind and reference, with and without a checkout code, in both densities', () => {
    const plain = html(h(Header, { kind: 'Invoice', reference: 'PO-12', logo: 'data:,' }))
    expect(plain).toContain('Invoice')
    expect(plain).toContain('PO-12')
    const roomy = html(
      h(Header, {
        kind: 'Invoice',
        reference: null,
        logo: 'data:,',
        density: 'roomy',
        checkout: { title: 'Pay online', note: 'Scan to pay', qr: 'data:,qr' },
      })
    )
    expect(roomy).toContain('Pay online')
    expect(roomy).toContain('Scan to pay')
  })

  it('footerHeight grows with density and a contact line', () => {
    expect(footerHeight('roomy')).toBeGreaterThan(footerHeight('compact'))
    expect(footerHeight('compact', true)).toBeGreaterThan(footerHeight('compact'))
  })

  it('Footer and NoteFooter render their words', () => {
    expect(
      html(
        h(Footer, {
          issued: 'Issued Oct 1',
          contact: ['(555) 010-0199', 'ops@example.test'],
          density: 'roomy',
        })
      )
    ).toContain('ops@example.test')
    expect(html(h(Footer, { issued: 'Issued Oct 1' }))).toContain('Issued Oct 1')
    expect(html(h(NoteFooter, { note: 'Thank you' }))).toContain('Thank you')
  })

  it('Hero renders the figure with and without a reference', () => {
    const withRef = html(
      h(Hero, {
        label: 'Payout',
        value: '$1,000.00',
        status: 'Paid',
        reference: { number: 'PO-12', customer: 'Ana' },
      })
    )
    expect(withRef).toContain('PO-12')
    expect(withRef).toContain('Ana')
    const anonymous = html(
      h(Hero, {
        label: 'Payout',
        value: '$0.00',
        status: 'Open',
        reference: { number: 'PO-13', customer: null },
      })
    )
    expect(anonymous).toContain('$0.00')
    expect(html(h(Hero, { label: 'Payout', value: '-$5.00', status: 'Open' }))).toContain('-$5.00')
  })

  it('Table renders rows with their facts, open and closed, and an empty table', () => {
    const rows = [
      { name: 'Gold chain', figure: '$500.00', facts: ['14K', null, '12.4 g'] },
      { name: 'Silver ring', figure: '$3.00', facts: [] },
    ]
    const open = html(h(Table, { cap: 'Items', column: 'Value', rows }))
    expect(open).toContain('Gold chain')
    expect(open).toContain('12.4 g')
    expect(html(h(Table, { cap: 'Items', column: 'Value', rows, closed: true }))).toContain(
      'Silver ring'
    )
    expect(html(h(Table, { cap: 'Items', column: 'Value', rows: [] }))).toContain('Items')
  })

  it('Summary renders the ledger and total, with a default and a custom label', () => {
    const out = html(
      h(Summary, {
        cap: 'Summary',
        lines: [
          { label: 'Metal', value: '$500.00' },
          { label: 'Fee', value: '-$5.00' },
        ],
        total: '$495.00',
      })
    )
    expect(out).toContain('-$5.00')
    expect(out).toContain('$495.00')
    expect(html(h(Summary, { lines: [], totalLabel: 'Due', total: '$0.00' }))).toContain('Due')
  })

  it('Pair renders both ends, strong lines and facts, with and without the connector', () => {
    const left = { label: 'From', who: 'Ana', lines: ['1 Main St', null, ''], strong: 'Acct 1234' }
    const right = { label: 'To', who: 'Dorado', lines: ['Dallas'] }
    const out = html(h(Pair, { cap: 'Route', facts: ['UPS', null], left, right, connector: true }))
    for (const text of ['From', 'Ana', 'Acct 1234', '1 Main St', 'Dorado', 'Dallas', 'UPS'])
      expect(out).toContain(text)
    expect(html(h(Pair, { cap: 'Route', left, right: { ...right, strong: null } }))).toContain(
      'Route'
    )
  })

  it('Instructions renders every step, aside and stage', () => {
    const step = (title: string) => ({ title, body: `${title} body` })
    const out = html(
      h(Instructions, {
        lead: 'Ship your items',
        sub: 'Three steps',
        stepsCap: 'Steps',
        steps: [step('Pack'), step('Label'), step('Drop off')],
        asideCap: 'Tips',
        aside: [step('Insure')],
        closingCap: 'Then',
        stages: [step('We assay'), step('We pay')],
      })
    )
    for (const text of ['Ship your items', 'Pack body', 'Drop off', 'Insure', 'We pay'])
      expect(out).toContain(text)
  })

  it('bandWith merges onto the band', () => {
    expect(bandWith({ color: 'red' }).color).toBe('red')
  })
})

describe('renderFramed', () => {
  it('frames a body with header and footer, defaulting density and contact', () => {
    const out = renderFramed(
      {
        title: 'Invoice PO-12',
        kind: 'Invoice',
        reference: 'PO-12',
        body: [h('p', { key: 'b' }, 'Body')],
        footer: 'Issued Oct 1',
      },
      'data:,logo',
      '@font-face{}'
    )
    expect(out.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(out).toContain('Invoice PO-12')
    expect(out).toContain('Body')
  })

  it('takes roomy density, a separate foot density, a checkout and contact lines', () => {
    const out = renderFramed(
      {
        title: 'T',
        kind: 'Quote',
        reference: null,
        body: [],
        footer: 'Issued',
        density: 'roomy',
        footDensity: 'compact',
        checkout: { title: 'Pay', note: 'Scan', qr: 'data:,' },
        contact: ['ops@example.test'],
      },
      'data:,',
      ''
    )
    expect(out).toContain('Pay')
    expect(out).toContain('ops@example.test')
  })
})
