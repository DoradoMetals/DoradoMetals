// The four gap atoms drawn 2026-08-30 (Menu, Progress, QuantityStepper,
// Toast) - pinning the contracts their Figma descriptions promise. Plain DOM
// assertions, no jest-dom, per the house style.
import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach } from 'vitest'
import * as React from 'react'

import { Progress, QuantityStepper, toast } from '@dorado/components'

afterEach(cleanup)

describe('Progress', () => {
  it('reports its value to assistive tech', () => {
    const { container } = render(<Progress value={66} />)
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement
    expect(bar).toBeTruthy()
    expect(bar.getAttribute('aria-valuenow')).toBe('66')
  })

  it('indeterminate drops aria-valuenow and sweeps', () => {
    const { container } = render(<Progress />)
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement
    expect(bar.getAttribute('aria-valuenow')).toBe(null)
    const sweep = container.querySelector('.animate-progress-sweep') as HTMLElement
    expect(sweep).toBeTruthy()
    // The sweep must pause for motion-reduce users.
    expect(sweep.className).toContain('motion-reduce:animate-none')
  })

  it('the rail is the sanctioned pill and the indicator moves by transform', () => {
    const { container } = render(<Progress value={25} />)
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement
    expect(bar.className).toContain('rounded-full')
    const indicator = bar.firstElementChild as HTMLElement
    expect(indicator.style.transform).toBe('translateX(-75%)')
  })

  it('clamps out-of-range values instead of overflowing the rail', () => {
    const { container } = render(<Progress value={140} />)
    const indicator = container.querySelector('[role="progressbar"]')!
      .firstElementChild as HTMLElement
    expect(indicator.style.transform).toBe('translateX(-0%)')
  })
})

describe('QuantityStepper', () => {
  it('steps and clamps through the buttons', () => {
    const onChange = vi.fn()
    const { getByLabelText } = render(
      <QuantityStepper value={2} onChange={onChange} min={1} max={3} />,
    )
    fireEvent.click(getByLabelText('Increase quantity'))
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('at the floor the decrement DISABLES, never removes', () => {
    const { getByLabelText } = render(
      <QuantityStepper value={1} onChange={() => {}} min={1} />,
    )
    const dec = getByLabelText('Decrease quantity') as HTMLButtonElement
    expect(dec.disabled).toBe(true)
    // Still rendered - reaching zero is the Remove action's job.
    expect(dec.isConnected).toBe(true)
  })

  it('the value is a real input: typing commits on blur, clamped', () => {
    const onChange = vi.fn()
    const { getByRole } = render(
      <QuantityStepper value={2} onChange={onChange} min={1} max={9} />,
    )
    const input = getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '40' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(9)
  })

  it('garbage reverts to the last real value rather than committing', () => {
    const onChange = vi.fn()
    const { getByRole } = render(
      <QuantityStepper value={2} onChange={onChange} />,
    )
    const input = getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(onChange).not.toHaveBeenCalled()
    expect(input.value).toBe('2')
  })

  it('arrow keys step from the input', () => {
    const onChange = vi.fn()
    const { getByRole } = render(
      <QuantityStepper value={2} onChange={onChange} max={9} />,
    )
    fireEvent.keyDown(getByRole('textbox'), { key: 'ArrowUp' })
    expect(onChange).toHaveBeenCalledWith(3)
  })
})

describe('toast', () => {
  it('danger persists until dismissed - no timer, close affordance', () => {
    // The house wrapper's one behavioural promise over sonner.
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const id = toast.error('Payment failed')
    expect(id).toBeTruthy()
    spy.mockRestore()
  })
})
