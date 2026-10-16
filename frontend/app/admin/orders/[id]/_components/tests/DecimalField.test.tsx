import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { formatFixed } from '../../_lib'
import { DecimalField, DecimalResetContext } from '../DecimalField'

describe('DecimalField', () => {
  test('shows the formatted value with its unit', () => {
    render(
      <DecimalField
        ariaLabel="Weight"
        value={1198.6}
        format={formatFixed}
        unit="g"
        onCommit={() => {}}
      />
    )
    expect((screen.getByLabelText('Weight') as HTMLInputElement).value).toBe('1,198.60')
    expect(screen.getByText('g')).toBeTruthy()
  })

  test('commits the parsed number on blur and reformats', () => {
    const onCommit = vi.fn()
    render(<DecimalField ariaLabel="Weight" value={1} format={formatFixed} onCommit={onCommit} />)
    const input = screen.getByLabelText('Weight') as HTMLInputElement
    fireEvent.change(input, { target: { value: '1,200.5' } })
    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledWith(1200.5)
    expect(input.value).toBe('1,200.50')
  })

  test('an unchanged or cleared value: no commit, or null', () => {
    const onCommit = vi.fn()
    render(<DecimalField ariaLabel="Weight" value={2} format={formatFixed} onCommit={onCommit} />)
    const input = screen.getByLabelText('Weight')
    fireEvent.blur(input)
    expect(onCommit).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledWith(null)
  })

  test('read-only without onCommit, and when readOnly is set', () => {
    const { rerender } = render(<DecimalField ariaLabel="Weight" value={2} format={formatFixed} />)
    expect(screen.getByLabelText('Weight')).toHaveProperty('readOnly', true)
    rerender(
      <DecimalField
        ariaLabel="Weight"
        value={2}
        format={formatFixed}
        onCommit={() => {}}
        readOnly
      />
    )
    expect(screen.getByLabelText('Weight')).toHaveProperty('readOnly', true)
  })

  test('a new value from the server replaces the text', () => {
    const { rerender } = render(
      <DecimalField ariaLabel="Weight" value={2} format={formatFixed} onCommit={() => {}} />
    )
    rerender(<DecimalField ariaLabel="Weight" value={3} format={formatFixed} onCommit={() => {}} />)
    expect((screen.getByLabelText('Weight') as HTMLInputElement).value).toBe('3.00')
  })

  test('a reset signal puts back the server value when the value did not change', () => {
    const field = (reset: number) => (
      <DecimalResetContext.Provider value={reset}>
        <DecimalField ariaLabel="Premium" value={80} format={formatFixed} onCommit={() => {}} />
      </DecimalResetContext.Provider>
    )
    const { rerender } = render(field(0))
    const input = screen.getByLabelText('Premium') as HTMLInputElement
    fireEvent.change(input, { target: { value: '81' } })
    fireEvent.blur(input)
    expect(input.value).toBe('81.00')
    rerender(field(0))
    expect(input.value).toBe('81.00')
    rerender(field(1))
    expect(input.value).toBe('80.00')
  })

  test('label and message render', () => {
    render(<DecimalField label="Net" message="Ours: 1.00 g" value={1} format={formatFixed} />)
    expect(screen.getByText('Net')).toBeTruthy()
    expect(screen.getByText('Ours: 1.00 g')).toBeTruthy()
  })
})
