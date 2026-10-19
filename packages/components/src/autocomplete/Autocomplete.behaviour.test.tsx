import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react'
import * as React from 'react'
import { Search } from '@dorado/icons'

import { Autocomplete, type AutocompleteItem, type AutocompleteProps } from './Autocomplete'
import { classList, setup, useUserFakeTimers } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

const all: AutocompleteItem[] = [
  { id: '1', textValue: 'Gold' },
  { id: '2', textValue: 'Silver', label: <b>Silver</b> },
  { id: '3', textValue: 'Platinum' },
]

function Harness(props: Partial<AutocompleteProps>) {
  const [value, setValue] = React.useState('')
  const items = all.filter((item) => item.textValue.toLowerCase().includes(value.toLowerCase()))
  return (
    <Autocomplete
      label="Metal"
      value={value}
      onValueChange={setValue}
      items={items}
      onSelect={(item) => setValue(item.textValue)}
      empty="No metal matches"
      {...props}
    />
  )
}

describe('Autocomplete state matrix', () => {
  it.each([
    ['default', {}],
    ['disabled', { disabled: true }],
    ['leading and trailing', { leading: <Search aria-hidden />, trailing: 'ozt' }],
    ['no label', { label: undefined, inputProps: { 'aria-label': 'Metal' } }],
    ['placeholder', { placeholder: 'Find a metal' }],
  ])('%s renders and axe finds nothing', async (_name, props) => {
    const { container, getByRole } = setup(<Harness {...props} />)
    expect(getByRole('combobox')).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('the open list passes axe', async () => {
    const { user, container, getByRole } = setup(<Harness />)
    await user.click(getByRole('combobox'))
    expect(getByRole('listbox')).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('the default control keeps its class list', () => {
    const { getByRole } = setup(<Harness />)
    expect(classList(getByRole('combobox').parentElement)).toMatchInlineSnapshot(`
      [
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
})

describe('Autocomplete behaviour', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('types to filter, clears to show all, and picks with a click', async () => {
    const { user, getByRole, getAllByRole } = setup(<Harness />)
    const box = getByRole('combobox') as HTMLInputElement
    await user.type(box, 'pl')
    expect(getAllByRole('option').map((o) => o.textContent)).toEqual(['Platinum'])
    await user.clear(box)
    expect(getAllByRole('option')).toHaveLength(3)
    await user.click(getByRole('option', { name: 'Silver' }))
    expect(box.value).toBe('Silver')
    expect(document.activeElement).toBe(box)
  })

  it('controlled: the value prop wins and every key reports', async () => {
    const onValueChange = vi.fn()
    const { user, getByRole } = setup(
      <Autocomplete
        label="Metal"
        value="Go"
        onValueChange={onValueChange}
        items={all}
        onSelect={() => {}}
      />
    )
    await user.type(getByRole('combobox'), 'l')
    expect(onValueChange).toHaveBeenCalledWith('Gol')
    expect((getByRole('combobox') as HTMLInputElement).value).toBe('Go')
  })

  it('keyboard: ArrowDown reopens after Escape, ArrowUp stops at the top, End and Home jump, Enter picks', async () => {
    const onSelect = vi.fn()
    const { user, getByRole, queryByRole } = setup(<Harness onSelect={onSelect} />)
    await user.tab()
    const box = getByRole('combobox')
    expect(getByRole('listbox')).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(queryByRole('listbox')).toBeNull()
    await user.keyboard('{ArrowDown}')
    expect(getByRole('listbox')).toBeTruthy()
    await user.keyboard('{ArrowUp}')
    expect(box.getAttribute('aria-activedescendant')).toMatch(/opt-1$/)
    await user.keyboard('{End}')
    expect(box.getAttribute('aria-activedescendant')).toMatch(/opt-3$/)
    await user.keyboard('{ArrowDown}')
    expect(box.getAttribute('aria-activedescendant')).toMatch(/opt-3$/)
    await user.keyboard('{Home}{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledWith(all[1])
    expect(queryByRole('listbox')).toBeNull()
  })

  it('hovering an option makes it active', async () => {
    const { user, getByRole } = setup(<Harness />)
    await user.click(getByRole('combobox'))
    await user.hover(getByRole('option', { name: 'Platinum' }))
    expect(getByRole('option', { name: 'Platinum' }).getAttribute('aria-selected')).toBe('true')
  })

  it('no match shows the empty line, and Escape closes it', async () => {
    const { user, getByRole, getByText, queryByText } = setup(<Harness />)
    await user.type(getByRole('combobox'), 'zz')
    expect(getByText('No metal matches')).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(queryByText('No metal matches')).toBeNull()
  })

  it('Enter with nothing shown does nothing; blur closes; caller key and blur handlers compose', async () => {
    const onSelect = vi.fn()
    const onKeyDown = vi.fn()
    const onBlur = vi.fn()
    const { user, getByRole, queryByRole } = setup(
      <>
        <Harness onSelect={onSelect} items={[]} inputProps={{ onKeyDown, onBlur }} />
        <button type="button">Next</button>
      </>
    )
    await user.click(getByRole('combobox'))
    await user.keyboard('{Enter}')
    expect(onSelect).not.toHaveBeenCalled()
    expect(onKeyDown).toHaveBeenCalled()
    await user.tab()
    expect(onBlur).toHaveBeenCalled()
    expect(queryByRole('listbox')).toBeNull()
  })

  it('disabled never opens', async () => {
    const { user, getByRole, queryByRole } = setup(<Harness disabled />)
    await user.click(getByRole('combobox'))
    expect(queryByRole('listbox')).toBeNull()
  })

  it('unmounting while the announcement is still debouncing logs nothing', async () => {
    useUserFakeTimers()
    const { user, getByRole, unmount } = setup(<Harness />, { fakeTimers: true })
    await user.type(getByRole('combobox'), 'g')
    unmount()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('the announcement settles after the debounce', async () => {
    useUserFakeTimers()
    const { user, getByRole } = setup(<Harness />, { fakeTimers: true })
    await user.type(getByRole('combobox'), 'v')
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(getByRole('status').textContent).toBe('1 matching')
  })
})
