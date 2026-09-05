import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Field } from './Field'
import { axeViolations } from '../test/axe'

describe('Field wraps a control that is not a library component', () => {
  it('the label points at the control and axe finds nothing', async () => {
    const { container, getByLabelText } = render(
      <Field label="Refiner" htmlFor="refiner">
        <select id="refiner">
          <option>Asahi</option>
        </select>
      </Field>
    )
    expect((getByLabelText('Refiner') as HTMLSelectElement).id).toBe('refiner')
    expect(await axeViolations(container)).toEqual([])
  })

  it('htmlFor is optional, for controls with nothing labellable inside', () => {
    const { container } = render(
      <Field label="Range">
        <div>a control that renders no labellable element</div>
      </Field>
    )
    expect(container.querySelector('label')?.getAttribute('for')).toBeNull()
  })

  it('it stacks the same way Input does, so the two line up', () => {
    const { container } = render(
      <Field label="Weight">
        <input />
      </Field>
    )
    const cls = (container.firstElementChild as HTMLElement).className
    expect(cls).toContain('flex-col')
    expect(cls).toContain('gap-0.5')
  })

  it('invalid reddens the label and the message', () => {
    const { container, getByText } = render(
      <Field label="Weight" invalid message="Required">
        <input />
      </Field>
    )
    expect(container.querySelector('label')?.className).toContain('text-destructive')
    expect(getByText('Required').className).toContain('text-destructive')
  })

  it('className is layout only and lands on the wrapper', () => {
    const { container } = render(
      <Field label="Weight" className="w-16">
        <input />
      </Field>
    )
    expect((container.firstElementChild as HTMLElement).className).toContain('w-16')
  })
})
