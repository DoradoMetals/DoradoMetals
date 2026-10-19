import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Popover } from './Popover'
import { expectNoAxeViolations } from '../test/axe'

describe('Popover', () => {
  it('opens its panel from the trigger and closes on Escape', async () => {
    const onOpenChange = vi.fn()
    const { getByRole, queryByText, getByText, container } = render(
      <Popover
        label="Metal"
        value="Gold"
        panel={<span>panel body</span>}
        onOpenChange={onOpenChange}
      />
    )
    const trigger = getByRole('button', { name: /Metal/ })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(queryByText('panel body')).toBeNull()
    fireEvent.click(trigger)
    expect(getByText('panel body')).toBeTruthy()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    await expectNoAxeViolations(container)
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(queryByText('panel body')).toBeNull()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('closes on an outside press', () => {
    const { getByRole, queryByText } = render(
      <Popover label="L" panel={<span>panel body</span>} defaultOpen />
    )
    expect(queryByText('panel body')).toBeTruthy()
    fireEvent.mouseDown(document.body)
    expect(queryByText('panel body')).toBeNull()
    expect(getByRole('button').getAttribute('aria-expanded')).toBe('false')
  })

  it('shows the placeholder when empty and the value when filled', () => {
    const { getByText, rerender } = render(<Popover label="L" />)
    expect(getByText('Select an option').className).toContain('text-placeholder')
    rerender(<Popover label="L" value="Gold" />)
    expect(getByText('Gold').className).not.toContain('text-placeholder')
  })

  it('error marks the trigger invalid and the label destructive', () => {
    const { getByRole, getByText } = render(<Popover label="Lbl" state="error" />)
    expect(getByRole('button').getAttribute('aria-invalid')).toBe('true')
    expect(getByRole('button').className).toContain('border-destructive')
    expect(getByText('Lbl').className).toContain('text-destructive')
  })

  it('disabled cannot open', () => {
    const { getByRole, queryByText } = render(
      <Popover label="L" state="disabled" panel={<span>panel body</span>} defaultOpen />
    )
    expect((getByRole('button') as HTMLButtonElement).disabled).toBe(true)
    expect(queryByText('panel body')).toBeNull()
    expect(getByRole('button').className).toContain('bg-muted')
  })
})
