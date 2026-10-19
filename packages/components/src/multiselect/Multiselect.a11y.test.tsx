import { describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Multiselect } from './Multiselect'
import { expectNoAxeViolations } from '../test/axe'

const items = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
]

function Controlled(props: Partial<React.ComponentProps<typeof Multiselect>>) {
  const [value, setValue] = React.useState<string[]>([])
  return (
    <Multiselect
      label="Columns"
      placeholder="Columns"
      items={items}
      value={value}
      onValueChange={setValue}
      {...props}
    />
  )
}

describe('Multiselect accessibility', () => {
  it('arrow keys, Home and End move through the options; Escape returns focus to the trigger', async () => {
    const { getByRole, container } = render(<Controlled />)
    const trigger = getByRole('button', { name: /Columns/ })
    fireEvent.click(trigger)
    const all = getByRole('checkbox', { name: 'Select all' })
    expect(document.activeElement).toBe(all)
    fireEvent.keyDown(all, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(getByRole('checkbox', { name: 'Alpha' }))
    fireEvent.keyDown(document.activeElement as Element, { key: 'End' })
    expect(document.activeElement).toBe(getByRole('checkbox', { name: 'Gamma' }))
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(getByRole('checkbox', { name: 'Beta' }))
    fireEvent.keyDown(document.activeElement as Element, { key: 'Home' })
    expect(document.activeElement).toBe(all)
    fireEvent.keyDown(all, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(all)
    const tabbable = Array.from(container.querySelectorAll('[role="checkbox"]')).filter(
      (el) => el.getAttribute('tabindex') !== '-1'
    )
    expect(tabbable).toEqual([all])
    await expectNoAxeViolations(container)
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' })
    expect(document.activeElement).toBe(trigger)
  })

  it('the trigger controls the panel, and loading marks it busy', () => {
    const { getByRole, rerender } = render(<Controlled />)
    const trigger = getByRole('button', { name: /Columns/ })
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-controls')).toBe(getByRole('group').id)
    rerender(<Controlled loading />)
    expect(getByRole('button', { name: /Columns|Loading/ }).getAttribute('aria-busy')).toBe('true')
  })
})
