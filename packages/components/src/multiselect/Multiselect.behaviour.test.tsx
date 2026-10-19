import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'

import { Multiselect, type MultiselectItem, type MultiselectProps } from './Multiselect'
import { classList, setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

const items: MultiselectItem[] = [
  { value: 'open', label: 'Open' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void', disabled: true },
  { value: 'held', label: <em>Held</em> },
]

function Harness(props: Partial<MultiselectProps>) {
  const [value, setValue] = React.useState<string[]>(props.value ?? [])
  return (
    <div>
      <p>Outside</p>
      <Multiselect
        label="Status"
        placeholder="All statuses"
        items={items}
        {...props}
        value={value}
        onValueChange={setValue}
      />
    </div>
  )
}

const states: [string, Partial<MultiselectProps>][] = [
  ['default', {}],
  ['some chosen', { value: ['open'] }],
  ['no count', { value: ['open'], showCount: false }],
  ['disabled', { disabled: true }],
  ['loading', { loading: true }],
  ['no label', { label: undefined }],
  ['no items', { items: [] }],
]

describe('Multiselect state matrix', () => {
  it.each(states)('%s renders and axe finds nothing', async (_name, props) => {
    const { container } = setup(
      <Multiselect
        label="Status"
        placeholder="All statuses"
        items={items}
        value={[]}
        onValueChange={() => {}}
        {...props}
      />
    )
    expect(container.querySelector('button')).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('the open panel passes axe', async () => {
    const { user, getByRole, container } = setup(<Harness />)
    await user.click(getByRole('button', { name: /Status/ }))
    await expectNoAxeViolations(container)
  })

  it('the default trigger keeps its class list', () => {
    const { container } = setup(
      <Multiselect placeholder="All statuses" items={items} value={[]} onValueChange={() => {}} />
    )
    expect(classList(container.querySelector('button'))).toMatchInlineSnapshot(`
      [
        "aria-[invalid=true]:border-destructive",
        "bg-card",
        "border",
        "border-border",
        "cursor-pointer",
        "data-[disabled]:opacity-50",
        "data-[disabled]:pointer-events-none",
        "data-[disabled]:text-foreground-disabled",
        "data-[invalid]:border-destructive",
        "data-[readonly]:cursor-default",
        "disabled:opacity-50",
        "disabled:pointer-events-none",
        "disabled:text-foreground-disabled",
        "flex",
        "focus-visible:border-primary",
        "focus-visible:outline-none",
        "focus-within:border-primary",
        "gap-xs",
        "items-center",
        "min-h-(--control-lg)",
        "px-sm",
        "rounded-lg",
        "text-field",
        "text-foreground",
        "text-left",
        "transition-colors",
        "w-full",
      ]
    `)
  })
})

describe('Multiselect behaviour', () => {
  it('controlled: the value prop wins and each toggle reports the next list', async () => {
    const onValueChange = vi.fn()
    const { user, getByRole } = setup(
      <Multiselect
        label="Status"
        placeholder="All statuses"
        items={items}
        value={['open']}
        onValueChange={onValueChange}
      />
    )
    await user.click(getByRole('button', { name: /Status/ }))
    await user.click(getByRole('checkbox', { name: 'Paid' }))
    expect(onValueChange).toHaveBeenLastCalledWith(['open', 'paid'])
    expect(getByRole('checkbox', { name: 'Paid' }).getAttribute('data-state')).toBe('unchecked')
    await user.click(getByRole('checkbox', { name: 'Open' }))
    expect(onValueChange).toHaveBeenLastCalledWith([])
  })

  it('Select all takes every enabled item, goes indeterminate on some, and Clear empties', async () => {
    const { user, getByRole, getByText } = setup(<Harness />)
    await user.click(getByRole('button', { name: /Status/ }))
    const all = getByRole('checkbox', { name: 'Select all' })
    await user.click(getByRole('checkbox', { name: 'Open' }))
    expect(all.getAttribute('data-state')).toBe('indeterminate')
    expect(getByText('1 selected')).toBeTruthy()
    await user.click(all)
    expect(all.getAttribute('data-state')).toBe('checked')
    expect(getByText('3 selected')).toBeTruthy()
    expect(getByRole('checkbox', { name: 'Void' }).getAttribute('data-state')).toBe('unchecked')
    await user.click(all)
    expect(all.getAttribute('data-state')).toBe('unchecked')
    await user.click(getByRole('checkbox', { name: 'Paid' }))
    await user.click(getByRole('button', { name: 'Clear' }))
    expect(getByRole('checkbox', { name: 'Paid' }).getAttribute('data-state')).toBe('unchecked')
  })

  it('an item with a non-text label is named by its value', async () => {
    const { user, getByRole } = setup(<Harness />)
    await user.click(getByRole('button', { name: /Status/ }))
    expect(getByRole('checkbox', { name: 'held' })).toBeTruthy()
  })

  it('keyboard: Enter opens on Select all, arrows rove, Home and End jump, Space toggles, Escape closes to the trigger', async () => {
    const { user, getByRole, queryByRole } = setup(<Harness />)
    await user.tab()
    const trigger = getByRole('button', { name: /Status/ })
    expect(document.activeElement).toBe(trigger)
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(getByRole('checkbox', { name: 'Select all' }))
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(getByRole('checkbox', { name: 'Open' }))
    await user.keyboard(' ')
    expect(getByRole('checkbox', { name: 'Open' }).getAttribute('data-state')).toBe('checked')
    await user.keyboard('{End}')
    expect(document.activeElement).toBe(getByRole('checkbox', { name: 'held' }))
    await user.keyboard('{Home}')
    expect(document.activeElement).toBe(getByRole('checkbox', { name: 'Select all' }))
    await user.keyboard('{Escape}')
    expect(queryByRole('group')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('a click outside closes the panel; the trigger toggles it', async () => {
    const { user, getByRole, queryByRole } = setup(<Harness />)
    const trigger = getByRole('button', { name: /Status/ })
    await user.click(trigger)
    expect(getByRole('group')).toBeTruthy()
    await user.click(getByRole('paragraph'))
    expect(queryByRole('group')).toBeNull()
    await user.click(trigger)
    await user.click(trigger)
    expect(queryByRole('group')).toBeNull()
  })

  it('loading and disabled never open the panel', async () => {
    const { user, getByRole, queryByRole, rerender } = setup(<Harness loading />)
    await user.click(getByRole('button', { name: /Status/ }))
    expect(queryByRole('group')).toBeNull()
    expect(getByRole('button', { name: /Status/ }).getAttribute('aria-busy')).toBe('true')
    rerender(<Harness disabled />)
    await user.click(getByRole('button', { name: /Status/ }))
    expect(queryByRole('group')).toBeNull()
  })

  it('with every item disabled, Select all stays unchecked', async () => {
    const { user, getByRole } = setup(
      <Harness items={[{ value: 'a', label: 'A', disabled: true }]} />
    )
    await user.click(getByRole('button', { name: /Status/ }))
    expect(getByRole('checkbox', { name: 'Select all' }).getAttribute('data-state')).toBe(
      'unchecked'
    )
  })
})
