import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { QuantityStepper } from './QuantityStepper'
import { expectNoAxeViolations } from '../test/axe'

describe('QuantityStepper accessibility', () => {
  it('the focusable input is the spinbutton with its value; the wrapper is a named group', async () => {
    const { getByRole, container } = render(
      <QuantityStepper value={3} onChange={() => {}} min={1} max={9} label="Gold bar" />
    )
    getByRole('group', { name: 'Gold bar' })
    const spin = getByRole('spinbutton', { name: 'Gold bar quantity' })
    expect(spin.tagName).toBe('INPUT')
    expect(spin.getAttribute('aria-valuenow')).toBe('3')
    expect(spin.getAttribute('aria-valuemin')).toBe('1')
    expect(spin.getAttribute('aria-valuemax')).toBe('9')
    await expectNoAxeViolations(container)
  })

  it('Home and End jump to the minimum and maximum', () => {
    const onChange = vi.fn()
    const { getByRole } = render(<QuantityStepper value={3} onChange={onChange} min={1} max={9} />)
    const spin = getByRole('spinbutton')
    fireEvent.keyDown(spin, { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith(9)
    fireEvent.keyDown(spin, { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith(1)
  })

  it('the container border is the only focus visual: no per-button outline or overlay', () => {
    const { getByRole } = render(<QuantityStepper value={3} onChange={() => {}} />)
    expect(getByRole('group').className).toContain('focus-within:border-primary')
    for (const name of ['Decrease quantity', 'Increase quantity']) {
      const button = getByRole('button', { name })
      expect(button.className).not.toContain('focus-ring')
      expect(button.className).not.toContain('hit-area')
    }
  })
})
