import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Autocomplete } from './Autocomplete'
import { axeViolations } from '../test/axe'

// Stand-in for a lucide icon: oversize on purpose, to prove the slot wins
// (Figma 100:29 composes Input's chassis - 16px leading icon, 26:391).
function FakeIcon({ className }: { className?: string }) {
  return (
    <svg data-testid="fake-icon" className={className} width={24} height={24}>
      <path d="M0 0h24v24H0z" />
    </svg>
  )
}

const items = [
  { id: '1', textValue: '123 Main St', label: '123 Main St' },
  { id: '2', textValue: '456 Oak Ave', label: '456 Oak Ave' },
]

function renderAC(extra: Partial<React.ComponentProps<typeof Autocomplete>> = {}) {
  return render(
    <Autocomplete
      label="Address"
      value="1"
      onValueChange={() => {}}
      items={items}
      onSelect={() => {}}
      {...extra}
    />
  )
}

describe('Autocomplete', () => {
  it('is a combobox that opens on focus with options, and axe finds nothing', async () => {
    const { getByRole, container } = renderAC()
    const input = getByRole('combobox')
    expect(input.getAttribute('aria-expanded')).toBe('false')
    fireEvent.focus(input)
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(getByRole('listbox')).toBeTruthy()
    expect(container.querySelectorAll('[role="option"]').length).toBe(2)
    expect(await axeViolations(container)).toEqual([])
  })

  it('arrows move aria-activedescendant, Enter selects', () => {
    const onSelect = vi.fn()
    const { getByRole } = renderAC({ onSelect })
    const input = getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-activedescendant')).toContain('opt-2')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(items[1])
  })

  it("caller's onFocus COMPOSES with the component's own", () => {
    const onFocus = vi.fn()
    const { getByRole } = renderAC({ inputProps: { onFocus } })
    const input = getByRole('combobox')
    fireEvent.focus(input)
    expect(onFocus).toHaveBeenCalled()
    expect(input.getAttribute('aria-expanded')).toBe('true')
  })

  it('disabled is the normal chrome at 50% (2026-09-05 convention)', () => {
    const { getByRole } = renderAC({ disabled: true })
    const input = getByRole('combobox') as HTMLInputElement
    const wrapper = input.parentElement as HTMLElement
    expect(wrapper.getAttribute('data-disabled')).toBe('true')
    expect(wrapper.className).toContain('data-[disabled]:opacity-50')
    expect(wrapper.className).toContain('bg-card')
    expect(wrapper.className).not.toContain('data-[disabled]:bg-muted')
    expect(input.className).toContain('disabled:text-foreground-disabled')
  })

  it('the input binds to size/h5, not size/body (100:29, 2026-09-04)', () => {
    const { getByRole } = renderAC()
    expect((getByRole('combobox') as HTMLInputElement).className).toContain('text-h5')
  })

  it('leading icon is boxed at 16px and matches the label token, regardless of its own className (100:29 composes 26:391)', () => {
    const { getByTestId } = renderAC({ leading: <FakeIcon className="size-6" /> })
    const wrapper = getByTestId('fake-icon').parentElement as HTMLElement
    expect(wrapper.className).toContain('size-4')
    expect(wrapper.className).toContain('[&>svg]:size-4')
    expect(wrapper.className).toContain('text-muted-foreground')
  })

  it('trailing icon is capped at 16px and gets the label token too (was missing it entirely)', () => {
    const { getByTestId } = renderAC({ trailing: <FakeIcon className="size-6" /> })
    const wrapper = getByTestId('fake-icon').parentElement as HTMLElement
    expect(wrapper.className).toContain('[&>svg]:size-4')
    expect(wrapper.className).toContain('text-muted-foreground')
  })
})
