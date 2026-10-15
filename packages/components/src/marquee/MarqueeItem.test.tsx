import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { MarqueeItem } from './MarqueeItem'
import { axeViolations } from '../test/axe'

describe('MarqueeItem', () => {
  it('renders label, value and delta', () => {
    const { getByText } = render(
      <MarqueeItem label="Gold" value="$2,411.20" delta="+12.34" trend="up" />
    )
    expect(getByText('Gold')).toBeTruthy()
    expect(getByText('$2,411.20')).toBeTruthy()
    expect(getByText('+12.34')).toBeTruthy()
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

  it('with an ask reads label, Bid, the bid, Ask and the muted ask', () => {
    const { getByText } = render(
      <MarqueeItem label="Gold" value="$2,411.20" ask="$2,412.80" delta="+0.8%" />
    )
    expect(getByText('Bid').className).toContain('text-placeholder')
    expect(getByText('Ask').className).toContain('text-placeholder')
    expect(getByText('$2,411.20').getAttribute('data-emphasis')).toBe('default')
    expect(getByText('$2,412.80').getAttribute('data-emphasis')).toBe('subtlest')
    const order = [...getByText('Gold').parentElement!.children].map((el) => el.textContent)
    expect(order).toEqual(['Gold', 'Bid', '$2,411.20', 'Ask', '$2,412.80', '+0.8%'])
  })

  it('is axe clean', async () => {
    const { container } = render(
      <MarqueeItem label="Gold" value="$2,411.20" delta="+12.34" trend="up" />
    )
    expect(await axeViolations(container)).toEqual([])
  })
})
