import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { MarqueeItem } from './MarqueeItem'
import { expectNoAxeViolations } from '../test/axe'

describe('MarqueeItem', () => {
  it('renders label, value and delta', () => {
    const { getByText } = render(
      <MarqueeItem label="Gold" value="$2,411.20" delta="+12.34" trend="up" />
    )
    expect(getByText('Gold')).toBeTruthy()
    expect(getByText('$2,411.20')).toBeTruthy()
    expect(getByText('+12.34')).toBeTruthy()
  })

  it('uses tabular digits and reserved widths on value and delta', () => {
    const { getByText } = render(<MarqueeItem label="Gold" value="$2,411.20" delta="+0.8%" />)
    for (const text of ['$2,411.20', '+0.8%']) {
      const cls = getByText(text).className
      expect(cls).toContain('tabular-nums')
      expect(cls).not.toContain('min-w-')
    }
    expect(getByText('Gold').parentElement!.className).toContain('gap-xs')
  })

  it('aligns to the baseline and renders a coloured move before the delta', () => {
    const { getByText } = render(
      <MarqueeItem label="Gold" value="$2,411.20" move="$4.20" delta="(0.8%)" trend="down" />
    )
    expect(getByText('Gold').parentElement!.className).toContain('items-baseline')
    const move = getByText('$4.20')
    for (const c of ['tabular-nums', 'text-destructive']) expect(move.className).toContain(c)
    const order = [...getByText('Gold').parentElement!.children].map((el) => el.textContent)
    expect(order).toEqual(['Gold', '$2,411.20', '$4.20(0.8%)'])
    const pair = move.parentElement!
    expect(pair.className).toContain('inline-flex')
    expect(pair.className).toContain('items-baseline')
    expect(pair.className).toContain('gap-3xs')
    expect([...pair.children].map((el) => el.textContent)).toEqual(['$4.20', '(0.8%)'])
  })

  it('sets the price in body text, medium weight', () => {
    const { getByText } = render(<MarqueeItem label="Gold" value="$2,411.20" />)
    const price = getByText('$2,411.20')
    expect(price.tagName).toBe('P')
    expect(price.className).toContain('font-medium')
  })

  it('colours the delta by trend', () => {
    const { getByText, rerender } = render(
      <MarqueeItem label="Gold" value="$2,411.20" delta="+12.34" trend="up" />
    )
    expect(getByText('+12.34').className).toContain('text-success')

    rerender(<MarqueeItem label="Gold" value="$2,411.20" delta="-8.60" trend="down" />)
    expect(getByText('-8.60').className).toContain('text-destructive')

    rerender(<MarqueeItem label="Gold" value="$2,411.20" delta="0.00" trend="flat" />)
    expect(getByText('0.00').className).not.toContain('text-success')
    expect(getByText('0.00').className).not.toContain('text-destructive')
  })

  it('shows one price per cell with no bid or ask caption', () => {
    const { getByText, queryByText } = render(
      <MarqueeItem label="Gold" value="$2,411.20" delta="+0.8%" />
    )
    expect(queryByText('Bid')).toBeNull()
    expect(queryByText('Ask')).toBeNull()
    const order = [...getByText('Gold').parentElement!.children].map((el) => el.textContent)
    expect(order).toEqual(['Gold', '$2,411.20', '+0.8%'])
  })

  it('is axe clean', async () => {
    const { container } = render(
      <MarqueeItem label="Gold" value="$2,411.20" delta="+12.34" trend="up" />
    )
    await expectNoAxeViolations(container)
  })
})
