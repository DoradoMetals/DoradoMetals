import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { QuantityStepper } from './QuantityStepper'
import { expectNoAxeViolations } from '../test/axe'

describe('QuantityStepper', () => {
  it('steps and clamps through the buttons, and axe finds nothing', async () => {
    const onChange = vi.fn()
    const { getByLabelText, container } = render(
      <QuantityStepper value={2} onChange={onChange} min={1} max={3} />
    )
    fireEvent.click(getByLabelText('Increase quantity'))
    expect(onChange).toHaveBeenCalledWith(3)
    await expectNoAxeViolations(container)
  })

  it('at the floor the decrement DISABLES, never removes', () => {
    const { getByLabelText } = render(<QuantityStepper value={1} onChange={() => {}} min={1} />)
    const dec = getByLabelText('Decrease quantity') as HTMLButtonElement
    expect(dec.disabled).toBe(true)
    expect(dec.isConnected).toBe(true)
  })

  it('typing commits on blur, clamped to max', () => {
    const onChange = vi.fn()
    const { getByRole } = render(<QuantityStepper value={2} onChange={onChange} min={1} max={9} />)
    const input = getByRole('spinbutton') as HTMLInputElement
    fireEvent.change(input, { target: { value: '40' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(9)
  })

  it('garbage reverts to the last real value rather than committing', () => {
    const onChange = vi.fn()
    const { getByRole } = render(<QuantityStepper value={2} onChange={onChange} />)
    const input = getByRole('spinbutton') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(onChange).not.toHaveBeenCalled()
    expect(input.value).toBe('2')
  })

  it('arrow keys step from the input', () => {
    const onChange = vi.fn()
    const { getByRole } = render(<QuantityStepper value={2} onChange={onChange} max={9} />)
    fireEvent.keyDown(getByRole('spinbutton'), { key: 'ArrowUp' })
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('the default border is border/border (132:1016), not the field input token', () => {
    const { getByRole } = render(<QuantityStepper value={2} onChange={() => {}} />)
    const group = getByRole('group')
    expect(group.className).toContain('border-border')
    expect(group.className).not.toContain('border-input')
  })

  it('the input carries spinbutton semantics with aria-valuenow (132:1016)', () => {
    const { getByRole } = render(<QuantityStepper value={2} onChange={() => {}} min={1} max={9} />)
    const group = getByRole('spinbutton')
    expect(group.getAttribute('aria-valuenow')).toBe('2')
    expect(group.getAttribute('aria-valuemin')).toBe('1')
    expect(group.getAttribute('aria-valuemax')).toBe('9')
  })

  it("the value text uses the theme's small size token, not Tailwind's default text-sm", () => {
    const { getByRole } = render(<QuantityStepper value={2} onChange={() => {}} />)
    const input = getByRole('spinbutton') as HTMLInputElement
    expect(input.className).toContain('text-small')
  })

  it('disabled is the normal chrome at 50%, not a muted fill (132:1016, 2026-10-10 convention)', () => {
    const { getByRole } = render(<QuantityStepper value={2} onChange={() => {}} disabled />)
    const group = getByRole('group')
    expect(group.className).toContain('opacity-50')
    expect(group.className).not.toContain('bg-muted')
    expect(group.className).toContain('bg-card')
    const input = getByRole('spinbutton') as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(input.className).toContain('disabled:text-foreground-disabled')
  })

  it('at-bound dimming (0.4 opacity) is its own cue, and does not compound with disabled (132:1016)', () => {
    const { getByLabelText, rerender } = render(
      <QuantityStepper value={1} onChange={() => {}} min={1} max={9} />
    )
    const dec = getByLabelText('Decrease quantity') as HTMLButtonElement
    expect(dec.className).toContain('opacity-40')

    rerender(<QuantityStepper value={1} onChange={() => {}} min={1} max={9} disabled />)
    const decDisabled = getByLabelText('Decrease quantity') as HTMLButtonElement
    expect(decDisabled.className).not.toContain('opacity-40')
  })
})
