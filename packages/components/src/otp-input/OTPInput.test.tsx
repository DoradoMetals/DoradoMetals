import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { OTPInput } from './OTPInput'
import { axeViolations } from '../test/axe'

describe('OTPInput', () => {
  it('one real input with one-time-code, and axe finds nothing', async () => {
    const { container } = render(
      <OTPInput value="" onValueChange={() => {}} label="Verification code" />
    )
    const inputs = container.querySelectorAll('input')
    expect(inputs.length).toBe(1)
    expect(inputs[0].getAttribute('autocomplete')).toBe('one-time-code')
    expect(await axeViolations(container)).toEqual([])
  })

  it('typing fills and onComplete fires exactly at full length', () => {
    const onValueChange = vi.fn()
    const onComplete = vi.fn()
    const { container } = render(
      <OTPInput
        value="12345"
        length={6}
        onValueChange={onValueChange}
        onComplete={onComplete}
        label="Code"
      />
    )
    fireEvent.change(container.querySelector('input')!, { target: { value: '123456' } })
    expect(onValueChange).toHaveBeenCalledWith('123456')
    expect(onComplete).toHaveBeenCalledWith('123456')
  })

  it('non-digits never reach the value', () => {
    const onValueChange = vi.fn()
    const { container } = render(<OTPInput value="" onValueChange={onValueChange} label="Code" />)
    fireEvent.change(container.querySelector('input')!, { target: { value: '12a' } })
    expect(onValueChange).toHaveBeenCalledWith('12')
  })

  it('disabled keeps the drawn muted cell AND fades to 50% (96:18, 2026-09-05)', () => {
    const { container } = render(
      <OTPInput value="" onValueChange={() => {}} label="Code" disabled />
    )
    const cells = container.querySelectorAll('[aria-hidden] > span')
    expect(cells.length).toBeGreaterThan(0)
    cells.forEach((cell) => {
      expect(cell.className).toContain('bg-muted')
      expect(cell.className).toContain('text-foreground-disabled')
      expect(cell.className).toContain('opacity-50')
    })
  })

  it('the first cell takes the cursor on mount', () => {
    const { container } = render(<OTPInput value="" onValueChange={() => {}} label="Code" />)
    const input = container.querySelector('input')!
    expect(document.activeElement).toBe(input)
  })

  it('autoFocus={false} leaves the cursor where it was', () => {
    const { container } = render(
      <OTPInput value="" onValueChange={() => {}} label="Code" autoFocus={false} />
    )
    expect(document.activeElement).not.toBe(container.querySelector('input'))
  })

  it('the active cell draws the caret, and only that one (96:11)', () => {
    const { container } = render(<OTPInput value="12" onValueChange={() => {}} label="Code" />)
    fireEvent.focus(container.querySelector('input')!)
    const carets = container.querySelectorAll('[data-testid="otp-caret"]')
    expect(carets.length).toBe(1)
    const cells = container.querySelectorAll('[data-testid="otp-cell"]')
    expect(cells[2]!.contains(carets[0]!)).toBe(true)
    expect(carets[0]!.className).toContain('animate-caret-blink')
    expect(carets[0]!.className).toContain('bg-foreground')
  })

  it('no caret before focus, none when full, none when disabled', () => {
    const unfocused = render(
      <OTPInput value="12" onValueChange={() => {}} label="Code" autoFocus={false} />
    )
    expect(unfocused.container.querySelectorAll('[data-testid="otp-caret"]').length).toBe(0)

    const full = render(<OTPInput value="123456" onValueChange={() => {}} label="Code" />)
    fireEvent.focus(full.container.querySelector('input')!)
    expect(full.container.querySelectorAll('[data-testid="otp-caret"]').length).toBe(0)

    const off = render(<OTPInput value="12" onValueChange={() => {}} label="Code" disabled />)
    fireEvent.focus(off.container.querySelector('input')!)
    expect(off.container.querySelectorAll('[data-testid="otp-caret"]').length).toBe(0)
  })

  it('a cell is the drawn 48 x 56 and never grows past it (96:32, 2026-09-11)', () => {
    const { container } = render(<OTPInput value="" onValueChange={() => {}} label="Code" />)
    const row = container.querySelector('[aria-hidden]')!
    expect(row.className).toContain('gap-sm')
    expect(row.className).toContain('justify-center')
    container.querySelectorAll('[data-testid="otp-cell"]').forEach((cell) => {
      expect(cell.className).toContain('h-14')
      expect(cell.className).toContain('max-w-[48px]')
      expect(cell.className).toContain('rounded-lg')
      expect(cell.className).toContain('text-h3')
    })
  })

  it('backspace shortens the value and moves the caret back a cell', () => {
    const onValueChange = vi.fn()
    const { container, rerender } = render(
      <OTPInput value="123" onValueChange={onValueChange} label="Code" />
    )
    const input = container.querySelector('input')!
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '12' } })
    expect(onValueChange).toHaveBeenCalledWith('12')
    rerender(<OTPInput value="12" onValueChange={onValueChange} label="Code" />)
    const cells = container.querySelectorAll('[data-testid="otp-cell"]')
    const caret = container.querySelector('[data-testid="otp-caret"]')!
    expect(cells[2]!.contains(caret)).toBe(true)
  })

  it('pasting six digits fills every cell at once', () => {
    const onValueChange = vi.fn()
    const onComplete = vi.fn()
    const { container, rerender } = render(
      <OTPInput value="" onValueChange={onValueChange} onComplete={onComplete} label="Code" />
    )
    const input = container.querySelector('input')!
    fireEvent.paste(input)
    fireEvent.change(input, { target: { value: '987654' } })
    expect(onValueChange).toHaveBeenCalledWith('987654')
    expect(onComplete).toHaveBeenCalledWith('987654')
    rerender(
      <OTPInput value="987654" onValueChange={onValueChange} onComplete={onComplete} label="Code" />
    )
    const cells = [...container.querySelectorAll('[data-testid="otp-cell"]')]
    expect(cells.map((c) => c.textContent)).toEqual(['9', '8', '7', '6', '5', '4'])
  })
})
