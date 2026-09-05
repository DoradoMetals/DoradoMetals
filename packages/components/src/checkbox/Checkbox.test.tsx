import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Checkbox } from './Checkbox'
import { axeViolations } from '../test/axe'

describe('Checkbox', () => {
  it('is a real checkbox that toggles, and axe finds nothing', async () => {
    const onCheckedChange = vi.fn()
    const { getByRole, container } = render(
      <Checkbox aria-label="Accept terms" onCheckedChange={onCheckedChange} />
    )
    const box = getByRole('checkbox', { name: 'Accept terms' })
    expect(box.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(box)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(await axeViolations(container)).toEqual([])
  })

  it('disabled is real', () => {
    const { getByRole } = render(<Checkbox aria-label="x" disabled />)
    expect((getByRole('checkbox') as HTMLButtonElement).disabled).toBe(true)
  })

  it("rest state matches the drawing's own border and fill, not the input's", () => {
    const { getByRole } = render(<Checkbox aria-label="x" />)
    const box = getByRole('checkbox')
    expect(box.className).toMatch(/\bborder-border\b/)
    expect(box.className).toMatch(/\bbg-card\b/)
    expect(box.className).not.toMatch(/border-input/)
  })

  it('disabled unchecked is a flat muted fill, not a translucent one', () => {
    const { getByRole } = render(<Checkbox aria-label="x" disabled />)
    const box = getByRole('checkbox')
    expect(box.className).toMatch(/disabled:data-\[state=unchecked\]:bg-muted/)
    expect(box.className).not.toMatch(/disabled:opacity-50/)
  })

  it('disabled checked is a flat border-strong fill with a legible glyph', () => {
    const { getByRole } = render(
      <Checkbox aria-label="x" checked disabled onCheckedChange={() => {}} />
    )
    const box = getByRole('checkbox')
    expect(box.className).toMatch(/disabled:data-\[state=checked\]:bg-border-strong/)
    expect(box.className).toMatch(/disabled:data-\[state=checked\]:text-muted-foreground/)
  })
})
