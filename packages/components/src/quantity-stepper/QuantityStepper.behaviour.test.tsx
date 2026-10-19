import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'

import { QuantityStepper } from './QuantityStepper'
import { setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

function Harness({ initial = 2, min, max }: { initial?: number; min?: number; max?: number }) {
  const [value, setValue] = React.useState(initial)
  return <QuantityStepper label="Coins" value={value} onChange={setValue} min={min} max={max} />
}

const box = (getByRole: (role: string) => HTMLElement) =>
  getByRole('spinbutton') as HTMLInputElement

describe('QuantityStepper behaviour', () => {
  it.each([
    ['default', { value: 2 }],
    ['at min', { value: 1 }],
    ['at max', { value: 99 }],
    ['disabled', { value: 2, disabled: true }],
  ])('%s renders and axe finds nothing', async (_name, props) => {
    const { container } = setup(<QuantityStepper onChange={() => {}} {...props} />)
    expect(container.querySelector('[role="spinbutton"]')).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('the buttons step and stop at the bounds', async () => {
    const { user, getByRole } = setup(<Harness initial={2} min={1} max={3} />)
    await user.click(getByRole('button', { name: 'Increase quantity' }))
    expect(box(getByRole).value).toBe('3')
    expect(getByRole('button', { name: 'Increase quantity' })).toHaveProperty('disabled', true)
    await user.click(getByRole('button', { name: 'Decrease quantity' }))
    await user.click(getByRole('button', { name: 'Decrease quantity' }))
    expect(box(getByRole).value).toBe('1')
    expect(getByRole('button', { name: 'Decrease quantity' })).toHaveProperty('disabled', true)
  })

  it('keys: ArrowUp, ArrowDown, Home and End move within the bounds', async () => {
    const { user, getByRole } = setup(<Harness initial={5} min={1} max={10} />)
    box(getByRole).focus()
    await user.keyboard('{ArrowUp}')
    expect(box(getByRole).value).toBe('6')
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(box(getByRole).value).toBe('4')
    await user.keyboard('{End}')
    expect(box(getByRole).value).toBe('10')
    await user.keyboard('{End}{Home}')
    expect(box(getByRole).value).toBe('1')
    await user.keyboard('{Home}{ArrowDown}')
    expect(box(getByRole).value).toBe('1')
  })

  it('typing keeps digits, Enter or blur commits clamped, and an empty draft reverts', async () => {
    const { user, getByRole } = setup(<Harness initial={5} min={1} max={20} />)
    await user.clear(box(getByRole))
    await user.type(box(getByRole), '1a5{Enter}')
    expect(box(getByRole).value).toBe('15')
    await user.clear(box(getByRole))
    await user.type(box(getByRole), '99')
    await user.tab()
    expect(box(getByRole).value).toBe('20')
    await user.clear(box(getByRole))
    await user.tab()
    expect(box(getByRole).value).toBe('20')
  })

  it('controlled: the value prop wins and onChange is not called for no change', async () => {
    const onChange = vi.fn()
    const { user, getByRole } = setup(<QuantityStepper value={4} onChange={onChange} />)
    await user.click(getByRole('button', { name: 'Increase quantity' }))
    expect(onChange).toHaveBeenCalledWith(5)
    expect(box(getByRole).value).toBe('4')
    onChange.mockClear()
    await user.clear(box(getByRole))
    await user.type(box(getByRole), '4{Enter}')
    expect(onChange).not.toHaveBeenCalled()
    expect(getByRole('group', { name: 'Quantity' })).toBeTruthy()
  })
})
