import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { Facts } from '../Facts'

describe('Facts', () => {
  const facts = [
    { label: 'Bank', value: 'Chase' },
    { label: 'Missing', value: null },
    { label: 'Off', value: false as const },
    { label: 'Amount', value: '$10.00' },
  ]

  it('drops null and false values and right-aligns the last on desktop', () => {
    const { container } = render(<Facts facts={facts} />)
    expect(screen.queryByText('Missing')).toBeNull()
    expect(screen.queryByText('Off')).toBeNull()
    expect(container.querySelector('dl')!.getAttribute('data-layout')).toBe('desktop')
    expect(screen.getByText('Amount').parentElement!.className).toContain('text-right')
    expect(screen.getByText('Bank').parentElement!.className).not.toContain('text-right')
  })

  it('mobile uses two columns and right-aligns every second fact', () => {
    const { container } = render(<Facts facts={facts} layout="mobile" />)
    expect(container.querySelector('dl')!.className).toContain('grid-cols-2')
    expect(screen.getByText('Amount').parentElement!.className).toContain('text-right')
  })
})
