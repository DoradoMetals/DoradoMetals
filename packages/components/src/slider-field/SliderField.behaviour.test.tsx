import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'

import { SliderField } from './SliderField'
import { setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

function Harness({ initial = 50 }: { initial?: number }) {
  const [value, setValue] = React.useState(initial)
  return (
    <SliderField
      label="Purity"
      unit="%"
      value={value}
      onValueChange={setValue}
      min={0}
      max={100}
      step={5}
    />
  )
}

const box = (getByRole: (role: string, options: { name: string }) => HTMLElement) =>
  getByRole('textbox', { name: 'Purity (%)' }) as HTMLInputElement

describe('SliderField', () => {
  it.each([
    ['default', {}],
    ['disabled', { disabled: true }],
    ['no unit', { unit: undefined }],
  ])('%s renders and axe finds nothing', async (_name, props) => {
    const { container } = setup(
      <SliderField label="Purity" unit="%" value={40} onValueChange={() => {}} {...props} />
    )
    expect(container.querySelector('[role="slider"]')).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('typing and Enter commits a clamped number', async () => {
    const { user, getByRole } = setup(<Harness />)
    await user.clear(box(getByRole))
    await user.type(box(getByRole), '250{Enter}')
    expect(box(getByRole).value).toBe('100')
    await user.clear(box(getByRole))
    await user.type(box(getByRole), '-5{Enter}')
    expect(box(getByRole).value).toBe('0')
  })

  it('blur commits; Escape drops the draft; a non-number is discarded', async () => {
    const { user, getByRole } = setup(<Harness initial={20} />)
    await user.clear(box(getByRole))
    await user.type(box(getByRole), '35')
    await user.tab()
    expect(box(getByRole).value).toBe('35')
    await user.clear(box(getByRole))
    await user.type(box(getByRole), '77{Escape}')
    expect(box(getByRole).value).toBe('35')
    await user.clear(box(getByRole))
    await user.type(box(getByRole), 'abc{Enter}')
    expect(box(getByRole).value).toBe('35')
  })

  it('the slider thumb moves by step with arrows, Home and End', async () => {
    const onValueChange = vi.fn()
    const { user, getByRole } = setup(
      <SliderField label="Purity" value={50} onValueChange={onValueChange} step={5} />
    )
    getByRole('slider').focus()
    await user.keyboard('{ArrowRight}')
    expect(onValueChange).toHaveBeenLastCalledWith(55)
    await user.keyboard('{Home}')
    expect(onValueChange).toHaveBeenLastCalledWith(0)
    await user.keyboard('{End}')
    expect(onValueChange).toHaveBeenLastCalledWith(100)
  })

  it('controlled: the value prop wins over the slider', async () => {
    const { user, getByRole } = setup(
      <SliderField label="Purity" value={50} onValueChange={() => {}} />
    )
    getByRole('slider').focus()
    await user.keyboard('{ArrowRight}')
    expect(getByRole('slider').getAttribute('aria-valuenow')).toBe('50')
  })
})
