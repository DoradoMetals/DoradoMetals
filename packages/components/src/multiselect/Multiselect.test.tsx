import { describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Multiselect } from './Multiselect'
import { expectNoAxeViolations } from '../test/axe'

const items = [
  { value: 'name', label: 'Name' },
  { value: 'priority', label: 'Priority' },
  { value: 'stage', label: 'Stage' },
]

function Controlled(props: { initial?: string[]; disabled?: boolean; loading?: boolean }) {
  const [value, setValue] = React.useState<string[]>(props.initial ?? [])
  return (
    <Multiselect
      label="Columns"
      placeholder="Columns"
      items={items}
      value={value}
      onValueChange={setValue}
      disabled={props.disabled}
      loading={props.loading}
    />
  )
}

describe('Multiselect (1183:127)', () => {
  it('the trigger shows the value and a count badge (1183:50), and axe finds nothing', async () => {
    const { getByRole, getByText, container } = render(<Controlled initial={['name', 'stage']} />)
    const trigger = getByRole('button', { name: /Columns/ })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(getByText('2 selected').className).toContain('bg-surface-soft')
    await expectNoAxeViolations(container)
  })

  it('Open: a checkbox listbox with Select all and Clear (1183:67)', () => {
    const { getByRole, getAllByRole, queryByText } = render(<Controlled initial={['name']} />)
    fireEvent.click(getByRole('button', { name: /Columns/ }))
    const options = getAllByRole('checkbox')
    expect(options.map((o) => o.getAttribute('aria-label') ?? o.textContent)).toEqual([
      'Select all',
      'Name',
      'Priority',
      'Stage',
    ])
    fireEvent.click(getByRole('checkbox', { name: 'Priority' }))
    expect(getByRole('checkbox', { name: 'Priority' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(getByRole('checkbox', { name: 'Select all' }))
    expect(queryByText('3 selected')).toBeTruthy()
    fireEvent.click(getByRole('button', { name: 'Clear' }))
    expect(queryByText(/selected/)).toBeNull()
  })

  it('Select all is mixed while some are checked', () => {
    const { getByRole } = render(<Controlled initial={['name']} />)
    fireEvent.click(getByRole('button', { name: /Columns/ }))
    expect(getByRole('checkbox', { name: 'Select all' }).getAttribute('aria-checked')).toBe('mixed')
  })

  it('Disabled does not open (1183:106)', () => {
    const { getByRole, queryAllByRole } = render(<Controlled disabled />)
    const trigger = getByRole('button', { name: /Columns/ }) as HTMLButtonElement
    expect(trigger.disabled).toBe(true)
    fireEvent.click(trigger)
    expect(queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('Loading reads Loading… with a spinner (1183:116)', () => {
    const { getByText, getByRole } = render(<Controlled loading />)
    expect(getByText('Loading…')).toBeTruthy()
    expect(getByRole('status')).toBeTruthy()
  })

  it('Escape closes the listbox', () => {
    const { getByRole, queryAllByRole } = render(<Controlled />)
    fireEvent.click(getByRole('button', { name: /Columns/ }))
    fireEvent.keyDown(getByRole('checkbox', { name: 'Name' }), { key: 'Escape' })
    expect(queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('the trigger announces a popup, focus moves to Select all on open and back on Escape', () => {
    const { getByRole, queryAllByRole } = render(<Controlled />)
    const trigger = getByRole('button', { name: /Columns/ })
    expect(trigger.getAttribute('aria-haspopup')).toBe('true')
    fireEvent.click(trigger)
    expect(document.activeElement).toBe(getByRole('checkbox', { name: 'Select all' }))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(queryAllByRole('checkbox')).toHaveLength(0)
    expect(document.activeElement).toBe(trigger)
  })
})
