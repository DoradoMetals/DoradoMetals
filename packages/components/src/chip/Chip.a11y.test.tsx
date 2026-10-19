import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Chip } from './Chip'
import { expectNoAxeViolations } from '../test/axe'

describe('Chip accessibility', () => {
  it('a dismissible chip nests no control inside another, and axe finds nothing', async () => {
    const { container, getByRole } = render(<Chip label="Gold" selected onDismiss={() => {}} />)
    const toggle = getByRole('button', { name: 'Gold' })
    const dismiss = getByRole('button', { name: 'Remove Gold' })
    expect(toggle.contains(dismiss)).toBe(false)
    expect(dismiss.tagName).toBe('BUTTON')
    await expectNoAxeViolations(container)
  })

  it('both the chip and its dismiss are keyboard operable and show the focus ring', () => {
    const onDismiss = vi.fn()
    const onClick = vi.fn()
    const { getByRole } = render(<Chip label="Silver" onClick={onClick} onDismiss={onDismiss} />)
    const toggle = getByRole('button', { name: 'Silver' })
    const dismiss = getByRole('button', { name: 'Remove Silver' })
    expect(toggle.className).toContain('focus-ring')
    expect(dismiss.className).toContain('focus-ring')
    expect(dismiss.className).not.toContain('hit-area')
    fireEvent.click(dismiss)
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('in a chip row, pressing a label never dismisses; the dismiss has no overlay past its own box', () => {
    const onDismiss = vi.fn()
    const onClick = vi.fn()
    const { getByRole } = render(
      <div className="flex gap-xs">
        <Chip label="Gold" onClick={onClick} onDismiss={onDismiss} />
        <Chip label="Silver" onClick={onClick} onDismiss={onDismiss} />
      </div>
    )
    for (const name of ['Gold', 'Silver']) {
      fireEvent.click(getByRole('button', { name }))
      expect(getByRole('button', { name: `Remove ${name}` }).className).not.toContain('hit-area')
    }
    expect(onClick).toHaveBeenCalledTimes(2)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('as a radio in a group it reports aria-checked, not aria-pressed', async () => {
    const { getByRole, container } = render(
      <div role="radiogroup" aria-label="Range">
        <Chip label="1D" role="radio" selected />
        <Chip label="1W" role="radio" />
      </div>
    )
    const on = getByRole('radio', { name: '1D' })
    expect(on.getAttribute('aria-checked')).toBe('true')
    expect(on.hasAttribute('aria-pressed')).toBe(false)
    expect(getByRole('radio', { name: '1W' }).getAttribute('aria-checked')).toBe('false')
    await expectNoAxeViolations(container)
  })
})
