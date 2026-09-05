// The library Autocomplete's combobox semantics, exercised for real.
import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Autocomplete } from '@dorado/components'

const items = [
  { id: 'a', textValue: '2709 Typhon Drive' },
  { id: 'b', textValue: '2709 Typhoon Court' },
  { id: 'c', textValue: '2710 Typhon Drive' },
]

function setup(extra: Partial<React.ComponentProps<typeof Autocomplete>> = {}) {
  const onSelect = vi.fn()
  render(
    <Autocomplete
      label="Pickup address"
      value="2709"
      onValueChange={() => {}}
      items={items}
      onSelect={onSelect}
      {...extra}
    />
  )
  return { onSelect, input: screen.getByRole('combobox', { name: /pickup address/i }) }
}

describe('the combobox contract', () => {
  test('closed until focus; open lists options; activedescendant tracks the highlight', () => {
    const { input } = setup()
    expect(input.getAttribute('aria-expanded')).toBe('false')

    fireEvent.focus(input)
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getAllByRole('option')).toHaveLength(3)
    // The first row is the highlighted one - the drawing's own note.
    expect(input.getAttribute('aria-activedescendant')).toContain('-opt-a')
    expect(screen.getAllByRole('option')[0].getAttribute('aria-selected')).toBe('true')
  })

  test('arrows move the highlight, Enter selects it, focus never leaves the input', () => {
    const { input, onSelect } = setup()
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-activedescendant')).toContain('-opt-c')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }))
  })

  test('Escape closes; clicking an option selects despite the blur race', () => {
    const { input, onSelect } = setup()
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.getAttribute('aria-expanded')).toBe('false')

    fireEvent.focus(input)
    const option = screen.getAllByRole('option')[2]
    // mousedown must be preventDefault'd so the click lands before blur closes
    const md = fireEvent.mouseDown(option)
    expect(md, 'mousedown was not prevented - blur will eat the click').toBe(false)
    fireEvent.click(option)
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }))
  })

  test('caller focus handlers COMPOSE with the machinery instead of replacing it', () => {
    const onFocus = vi.fn()
    const { input } = setup({ inputProps: { onFocus } })
    fireEvent.focus(input)
    expect(onFocus).toHaveBeenCalled()
    expect(input.getAttribute('aria-expanded'), 'inputProps.onFocus clobbered open').toBe('true')
  })
})
