import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Autocomplete } from './Autocomplete'
import { expectNoAxeViolations } from '../test/axe'

const all = [
  { id: '1', textValue: 'Gold' },
  { id: '2', textValue: 'Silver' },
  { id: '3', textValue: 'Platinum' },
]

function Harness({ empty }: { empty?: React.ReactNode }) {
  const [value, setValue] = React.useState('')
  const items = all.filter((i) => i.textValue.toLowerCase().includes(value.toLowerCase()))
  return (
    <Autocomplete
      label="Metal"
      value={value}
      onValueChange={setValue}
      items={items}
      onSelect={() => {}}
      empty={empty}
    />
  )
}

describe('Autocomplete accessibility', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('announces the matching count once the list settles, and nothing for an empty query', async () => {
    vi.useFakeTimers()
    const { getByRole, container } = render(<Harness />)
    const input = getByRole('combobox', { name: 'Metal' })
    fireEvent.focus(input)
    const status = getByRole('status')
    expect(status.getAttribute('aria-live')).toBe('polite')
    act(() => vi.advanceTimersByTime(400))
    expect(status.textContent).toBe('')
    fireEvent.change(input, { target: { value: 'i' } })
    act(() => vi.advanceTimersByTime(100))
    expect(status.textContent).toBe('')
    fireEvent.change(input, { target: { value: 'il' } })
    act(() => vi.advanceTimersByTime(299))
    expect(status.textContent).toBe('')
    act(() => vi.advanceTimersByTime(1))
    expect(status.textContent).toBe('1 matching')
    fireEvent.change(input, { target: { value: '' } })
    act(() => vi.advanceTimersByTime(400))
    expect(status.textContent).toBe('')
    vi.useRealTimers()
    await expectNoAxeViolations(container)
  })

  it('the empty message sits outside the listbox so the listbox holds only options', async () => {
    const { getByRole, container } = render(<Harness empty="No metal found" />)
    const input = getByRole('combobox')
    fireEvent.focus(input)
    vi.useFakeTimers()
    fireEvent.change(input, { target: { value: 'zzz' } })
    act(() => vi.advanceTimersByTime(300))
    expect(getByRole('status').textContent).toBe('0 matching')
    vi.useRealTimers()
    expect(container.textContent).toContain('No metal found')
    expect(container.querySelector('[role="listbox"]')).toBeNull()
    expect(container.querySelector('[role="listbox"] li:not([role="option"])')).toBeNull()
    await expectNoAxeViolations(container)
  })

  it('Home and End jump to the first and last option', () => {
    const { getByRole } = render(<Harness />)
    const input = getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'End' })
    expect(input.getAttribute('aria-activedescendant')).toMatch(/-opt-3$/)
    fireEvent.keyDown(input, { key: 'Home' })
    expect(input.getAttribute('aria-activedescendant')).toMatch(/-opt-1$/)
  })
})
