import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { OTPInput } from './OTPInput'
import { expectNoAxeViolations } from '../test/axe'

describe('OTPInput', () => {
  it('one real input with one-time-code, and axe finds nothing', async () => {
    const { container } = render(
      <OTPInput value="" onValueChange={() => {}} label="Verification code" />
    )
    const inputs = container.querySelectorAll('input')
    expect(inputs.length).toBe(1)
    expect(inputs[0].getAttribute('autocomplete')).toBe('one-time-code')
    await expectNoAxeViolations(container)
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

  it('error cells are a 1px destructive border and the digit is destructive too (96:14)', () => {
    const { container } = render(
      <OTPInput value="123" length={6} onValueChange={() => {}} invalid label="Code" />
    )
    const cells = container.querySelectorAll('[data-testid="otp-cell"]')
    const filledCell = cells[0] as HTMLElement
    expect(filledCell.className).toContain('border-destructive')
    expect(filledCell.className).toContain('text-destructive')
    expect(filledCell.className).not.toContain('border-[1.5px]')
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
    expect(row.className).toContain('justify-between')
    container.querySelectorAll('[data-testid="otp-cell"]').forEach((cell) => {
      expect(cell.className).toContain('h-14')
      expect(cell.className).toContain('max-w-(--control-xl)')
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

  it('a paste anywhere in the group spreads the digits and puts the cursor after the last one', () => {
    const onValueChange = vi.fn()
    const onComplete = vi.fn()
    const { container } = render(
      <OTPInput
        value=""
        onValueChange={onValueChange}
        onComplete={onComplete}
        label="Code"
        autoFocus={false}
      />
    )
    const input = container.querySelector('input')!
    const cell = container.querySelectorAll('[data-testid="otp-cell"]')[3]!
    fireEvent.paste(cell, { clipboardData: { getData: () => 'Your code: 123 456' } })
    expect(onValueChange).toHaveBeenCalledWith('123456')
    expect(onComplete).toHaveBeenCalledWith('123456')
    expect(document.activeElement).toBe(input)
  })

  it('a short paste fills only the cells it has digits for', () => {
    const onValueChange = vi.fn()
    const { container } = render(<OTPInput value="" onValueChange={onValueChange} label="Code" />)
    fireEvent.paste(container.querySelector('input')!, {
      clipboardData: { getData: () => '12-3' },
    })
    expect(onValueChange).toHaveBeenCalledWith('123')
  })

  it('the input offers the SMS code on iOS and Android, and no maxlength cuts a spaced paste', () => {
    const { container } = render(<OTPInput value="" onValueChange={() => {}} label="Code" />)
    const input = container.querySelector('input')!
    expect(input.getAttribute('autocomplete')).toBe('one-time-code')
    expect(input.getAttribute('inputmode')).toBe('numeric')
    expect(input.getAttribute('pattern')).toBe('[0-9]*')
    expect(input.hasAttribute('maxlength')).toBe(false)
  })

  it('a seventh typed digit is dropped and backspace removes the last digit', () => {
    const onValueChange = vi.fn()
    const { container } = render(
      <OTPInput value="123456" onValueChange={onValueChange} label="Code" />
    )
    const input = container.querySelector('input')!
    fireEvent.change(input, { target: { value: '1234567' } })
    expect(onValueChange).toHaveBeenLastCalledWith('123456')
    fireEvent.change(input, { target: { value: '12345' } })
    expect(onValueChange).toHaveBeenLastCalledWith('12345')
  })
})
