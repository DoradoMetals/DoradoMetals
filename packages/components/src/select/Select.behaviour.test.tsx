import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'

import { Select, type SelectItemShape, type SelectProps } from './Select'
import { classList, setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

const items: SelectItemShape[] = [
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
  { value: 'platinum', label: 'Platinum', disabled: true },
  { value: 'palladium', label: 'Palladium' },
]

const states: [string, Partial<SelectProps>][] = [
  ['default', {}],
  ['labelled', { label: 'Metal' }],
  ['filled', { label: 'Metal', defaultValue: 'silver' }],
  ['disabled', { label: 'Metal', disabled: true }],
  ['invalid with message', { label: 'Metal', invalid: true, message: 'Pick one' }],
  ['required with hint', { label: 'Metal', required: true, message: 'Used for pricing' }],
  ['no items', { label: 'Metal', items: [] }],
]

describe('Select state matrix', () => {
  it.each(states)('%s renders and axe finds nothing', async (_name, props) => {
    const { container, getByRole } = setup(<Select items={items} {...props} />)
    expect(getByRole('combobox')).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('the default trigger keeps its class list', () => {
    const { getByRole } = setup(<Select items={items} />)
    expect(classList(getByRole('combobox'))).toMatchInlineSnapshot(`
      [
        "[&>span]:truncate",
        "aria-[invalid=true]:border-destructive",
        "bg-card",
        "border",
        "border-border",
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
        "justify-between",
        "min-h-(--control-lg)",
        "px-sm",
        "rounded-lg",
        "text-field",
        "text-foreground",
        "transition-colors",
        "w-full",
      ]
    `)
  })

  it('an unlabelled select is named by its placeholder', () => {
    const { getByRole } = setup(<Select items={items} placeholder="Metal" />)
    expect(getByRole('combobox', { name: 'Metal' })).toBeTruthy()
  })
})

describe('Select behaviour', () => {
  it('uncontrolled: picking an option shows it and fires the callback', async () => {
    const onValueChange = vi.fn()
    const { user, getByRole, findByRole } = setup(
      <Select label="Metal" items={items} onValueChange={onValueChange} />
    )
    await user.click(getByRole('combobox', { name: 'Metal' }))
    await user.click(await findByRole('option', { name: 'Silver' }))
    expect(onValueChange).toHaveBeenCalledWith('silver')
    expect(getByRole('combobox').textContent).toContain('Silver')
  })

  it('controlled: the value prop wins and the callback still fires', async () => {
    const onValueChange = vi.fn()
    const { user, getByRole, findByRole } = setup(
      <Select label="Metal" items={items} value="gold" onValueChange={onValueChange} />
    )
    await user.click(getByRole('combobox'))
    await user.click(await findByRole('option', { name: 'Palladium' }))
    expect(onValueChange).toHaveBeenCalledWith('palladium')
    expect(getByRole('combobox').textContent).toContain('Gold')
  })

  it('controlled through state follows each change', async () => {
    function Harness() {
      const [value, setValue] = React.useState('gold')
      return <Select label="Metal" items={items} value={value} onValueChange={setValue} />
    }
    const { user, getByRole, findByRole } = setup(<Harness />)
    await user.click(getByRole('combobox'))
    await user.click(await findByRole('option', { name: 'Silver' }))
    expect(getByRole('combobox').textContent).toContain('Silver')
  })

  it('opens from the keyboard, skips a disabled option, and Enter chooses', async () => {
    const onValueChange = vi.fn()
    const { user, getByRole, queryByRole } = setup(
      <Select label="Metal" items={items} defaultValue="silver" onValueChange={onValueChange} />
    )
    await user.tab()
    expect(getByRole('combobox')).toBe(document.activeElement)
    await user.keyboard('{Enter}')
    expect(getByRole('listbox')).toBeTruthy()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onValueChange).toHaveBeenCalledWith('palladium')
    expect(queryByRole('listbox')).toBeNull()
  })

  it('Escape closes without choosing and returns focus to the trigger', async () => {
    const onValueChange = vi.fn()
    const { user, getByRole, queryByRole } = setup(
      <Select label="Metal" items={items} onValueChange={onValueChange} />
    )
    await user.click(getByRole('combobox'))
    expect(getByRole('listbox')).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(queryByRole('listbox')).toBeNull()
    expect(onValueChange).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(getByRole('combobox'))
  })

  it('a disabled select does not open', async () => {
    const { user, getByRole, queryByRole } = setup(<Select label="Metal" items={items} disabled />)
    await user.click(getByRole('combobox'))
    expect(queryByRole('listbox')).toBeNull()
  })

  it('a long label stays inside the truncating trigger', () => {
    const long = 'A very long option label '.repeat(10).trim()
    const { getByRole } = setup(
      <Select label="Metal" items={[{ value: 'long', label: long }]} defaultValue="long" />
    )
    expect(getByRole('combobox').className).toContain('[&>span]:truncate')
    expect(getByRole('combobox').textContent).toContain(long)
  })

  it('inside a form, a name posts the chosen value through a hidden native select', () => {
    const { container } = setup(
      <form aria-label="Order">
        <Select label="Metal" items={items} name="metal" defaultValue="gold" />
      </form>
    )
    const native = container.querySelector('select[name="metal"]') as HTMLSelectElement | null
    expect(native?.value).toBe('gold')
  })
})
