import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Input } from './Input'
import { axeViolations } from '../test/axe'

// Stand-in for a lucide icon: a plain <svg>, sized oversize on purpose to
// prove the slot - not the caller - wins (Figma 26:391 draws it at 16px).
function FakeIcon({ className }: { className?: string }) {
  return (
    <svg data-testid="fake-icon" className={className} width={24} height={24}>
      <path d="M0 0h24v24H0z" />
    </svg>
  )
}

describe('Input', () => {
  it('label reaches the input, and axe finds nothing', async () => {
    const { getByLabelText, container } = render(<Input label="Order note" />)
    expect(getByLabelText('Order note')).toBeTruthy()
    expect(await axeViolations(container)).toEqual([])
  })

  it('invalid rides aria-invalid and the message renders', () => {
    const { container, getByText } = render(
      <Input label="Weight" invalid message="Must be a number" />
    )
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(getByText('Must be a number')).toBeTruthy()
  })

  it('trailing slot renders - the unit label', () => {
    const { getByText } = render(<Input label="Weight" trailing={<span>t oz</span>} />)
    expect(getByText('t oz')).toBeTruthy()
  })

  it("leading icon is boxed at 16px and shares the label token (26:391), regardless of the icon's own className", () => {
    const { container, getByTestId } = render(
      <Input label="Phone" leading={<FakeIcon className="size-6" />} />
    )
    const wrapper = getByTestId('fake-icon').parentElement as HTMLElement
    expect(wrapper.className).toContain('size-4')
    expect(wrapper.className).toContain('[&>svg]:size-4')
    expect(wrapper.className).toContain('text-muted-foreground')
    const label = container.querySelector('label') as HTMLElement
    expect(label.className).toContain('text-muted-foreground')
  })

  it('trailing clear icon is capped at 16px, and the unit-label trailing stays auto-width', () => {
    const { getByTestId, getByText, rerender } = render(
      <Input label="Weight" trailing={<FakeIcon className="size-6" />} />
    )
    const iconWrapper = getByTestId('fake-icon').parentElement as HTMLElement
    expect(iconWrapper.className).toContain('[&>svg]:size-4')
    expect(iconWrapper.className).toContain('text-muted-foreground')
    expect(iconWrapper.className).not.toContain('size-4 shrink-0 items-center justify-center')

    rerender(<Input label="Weight" trailing={<span>t oz</span>} />)
    const textWrapper = getByText('t oz').parentElement as HTMLElement
    expect(textWrapper.className).toContain('text-muted-foreground')
  })

  it('disabled is the normal chrome at 50% (2026-09-05 convention)', () => {
    const { container } = render(<Input label="Weight" disabled />)
    const wrapper = container.querySelector('[data-disabled]') as HTMLElement
    expect(wrapper.className).toContain('disabled:opacity-50')
    expect(wrapper.className).toContain('bg-card')
    expect(wrapper.className).not.toContain('disabled:bg-muted')
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.className).toContain('disabled:text-foreground-disabled')
  })

  it('State=ReadOnly keeps the full-contrast Default chrome and only stops edits (26:391, 2026-09-05)', () => {
    const { container } = render(<Input label="Order number" readOnly value="PO-2481" onChange={() => {}} />)
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.readOnly).toBe(true)
    expect(input.disabled).toBe(false)
    expect(input.className).toContain('text-foreground')
    expect(input.className).toContain('read-only:cursor-default')
    const wrapper = container.querySelector('[data-readonly]') as HTMLElement
    expect(wrapper).toBeTruthy()
    expect(wrapper.getAttribute('data-disabled')).toBeNull()
  })

  it('disabled dims the label to foreground-disabled too (26:391)', () => {
    const { getByText } = render(<Input label="Weight" disabled />)
    expect(getByText('Weight').className).toContain('text-foreground-disabled')
  })

  it('value text binds to size/h5, not size/body (26:391, 2026-09-04)', () => {
    const { getByLabelText } = render(<Input label="Weight" />)
    expect((getByLabelText('Weight') as HTMLInputElement).className).toContain('text-h5')
  })

  it('a number field hides its spinners and asks for the decimal keypad', () => {
    const { getByLabelText } = render(<Input label="Weight" type="number" />)
    const el = getByLabelText('Weight') as HTMLInputElement
    expect(el.getAttribute('inputmode')).toBe('decimal')
    expect(el.className).toContain('[&::-webkit-inner-spin-button]:appearance-none')
    expect(el.className).toContain('[-moz-appearance:textfield]')
  })

  it('a text field gets neither', () => {
    const { getByLabelText } = render(<Input label="Name" />)
    const el = getByLabelText('Name') as HTMLInputElement
    expect(el.getAttribute('inputmode')).toBeNull()
    expect(el.className).not.toContain('appearance-none')
  })

  it('an explicit inputMode still wins', () => {
    const { getByLabelText } = render(<Input label="Pin" type="number" inputMode="numeric" />)
    expect((getByLabelText('Pin') as HTMLInputElement).getAttribute('inputmode')).toBe('numeric')
  })

  it('inputClassName reaches the control, className stays on the wrapper', () => {
    const { getByLabelText, container } = render(
      <Input label="Qty" inputClassName="h-6 text-right" className="w-16" />
    )
    expect((getByLabelText('Qty') as HTMLInputElement).className).toContain('h-6')
    expect((container.firstElementChild as HTMLElement).className).toContain('w-16')
  })
})
